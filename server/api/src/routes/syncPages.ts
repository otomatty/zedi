/**
 * /api/sync/pages — ページ同期 (LWW)
 *
 * GET  /api/sync/pages  — 差分ページ取得 (since クエリパラメータ)
 * POST /api/sync/pages  — ページ + リンク バルク同期
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, gt, inArray, isNull } from "drizzle-orm";
import { pages, links, ghostLinks } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── GET /sync/pages ─────────────────────────────────────────────────────────
// 個人ページ同期はクライアントの IndexedDB と個人ページ (`pages.note_id IS
// NULL`) のみを対象にする。ノートネイティブページ（issue #713）はサーバー側
// で管理され、ノート画面/共同編集経由でのみアクセスする。
//
// Personal-page sync only mirrors personal pages (`pages.note_id IS NULL`)
// into the client's IndexedDB. Note-native pages (issue #713) live solely on
// the server and are accessed through the note view / collaborative editor.
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const since = c.req.query("since");

  const personalPageFilter = and(eq(pages.ownerId, userId), isNull(pages.noteId));

  let query = db
    .select({
      id: pages.id,
      owner_id: pages.ownerId,
      title: pages.title,
      content_preview: pages.contentPreview,
      thumbnail_url: pages.thumbnailUrl,
      source_url: pages.sourceUrl,
      source_page_id: pages.sourcePageId,
      is_deleted: pages.isDeleted,
      created_at: pages.createdAt,
      updated_at: pages.updatedAt,
    })
    .from(pages)
    .where(personalPageFilter)
    .$dynamic();

  if (since) {
    query = query.where(and(personalPageFilter, gt(pages.updatedAt, new Date(since))));
  }

  const rows = await query.orderBy(pages.updatedAt);
  const pageIds = rows.map((r) => r.id);

  let linksRows: (typeof links.$inferSelect)[] = [];
  let ghostLinksRows: (typeof ghostLinks.$inferSelect)[] = [];

  if (pageIds.length > 0) {
    linksRows = await db.select().from(links).where(inArray(links.sourceId, pageIds));

    ghostLinksRows = await db
      .select()
      .from(ghostLinks)
      .where(inArray(ghostLinks.sourcePageId, pageIds));
  }

  return c.json({
    pages: rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    })),
    links: linksRows.map((l) => ({
      source_id: l.sourceId,
      target_id: l.targetId,
      created_at: l.createdAt.toISOString(),
    })),
    ghost_links: ghostLinksRows.map((g) => ({
      link_text: g.linkText,
      source_page_id: g.sourcePageId,
      created_at: g.createdAt.toISOString(),
      original_target_page_id: g.originalTargetPageId,
      original_note_id: g.originalNoteId,
    })),
    server_time: new Date().toISOString(),
  });
});

// ── POST /sync/pages ────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    pages: Array<{
      id: string;
      title?: string;
      content_preview?: string;
      thumbnail_url?: string;
      source_url?: string;
      source_page_id?: string;
      is_deleted?: boolean;
      updated_at: string;
    }>;
    links?: Array<{
      source_id: string;
      target_id: string;
    }>;
    ghost_links?: Array<{
      link_text: string;
      source_page_id: string;
      original_target_page_id?: string;
      original_note_id?: string;
    }>;
  }>();

  if (!body.pages?.length) {
    throw new HTTPException(400, { message: "pages array is required" });
  }

  const results: Array<{ id: string; action: string }> = [];

  // ページごとに LWW (Last Write Wins) 同期。
  // 同期対象は個人ページ（`pages.note_id IS NULL`）のみ。ノートネイティブ
  // ページ（issue #713）や他人の個人ページは衝突回避のため `skipped` 扱い。
  //
  // バルク取得で N+1 を避ける: クライアントから来た全 ID を一括で引き、
  // メモリ上で「未存在 / 自分の個人ページ / それ以外（ノートネイティブ or
  // 他人）」に振り分けてから個別の DML を発行する。
  //
  // LWW sync runs only against personal pages (`pages.note_id IS NULL`).
  // Note-native pages (issue #713) and other users' personal pages are skipped
  // to avoid ID collisions and IDOR.
  //
  // Bulk-load to avoid N+1: fetch every incoming id in one query, then classify
  // in memory as "missing", "owned personal", or "other (note-native or
  // someone else's)". Only after that do we issue per-row DML.
  const incomingIds = [...new Set(body.pages.map((p) => p.id))];
  const existingRows =
    incomingIds.length > 0
      ? await db
          .select({
            id: pages.id,
            ownerId: pages.ownerId,
            noteId: pages.noteId,
            updatedAt: pages.updatedAt,
          })
          .from(pages)
          .where(inArray(pages.id, incomingIds))
      : [];
  const existingMap = new Map(existingRows.map((row) => [row.id, row]));

  for (const p of body.pages) {
    const existing = existingMap.get(p.id);
    const clientTime = new Date(p.updated_at);

    if (!existing) {
      await db.insert(pages).values({
        id: p.id,
        ownerId: userId,
        title: p.title ?? null,
        contentPreview: p.content_preview ?? null,
        thumbnailUrl: p.thumbnail_url ?? null,
        sourceUrl: p.source_url ?? null,
        sourcePageId: p.source_page_id ?? null,
        isDeleted: p.is_deleted ?? false,
        createdAt: clientTime,
        updatedAt: clientTime,
      });
      results.push({ id: p.id, action: "created" });
      continue;
    }

    // ノートネイティブ or 他人の個人ページは触らない
    // Skip note-native rows or rows owned by another user
    if (existing.noteId !== null || existing.ownerId !== userId) {
      results.push({ id: p.id, action: "skipped" });
      continue;
    }

    if (clientTime > existing.updatedAt) {
      await db
        .update(pages)
        .set({
          title: p.title ?? null,
          contentPreview: p.content_preview ?? null,
          thumbnailUrl: p.thumbnail_url ?? null,
          sourceUrl: p.source_url ?? null,
          sourcePageId: p.source_page_id ?? null,
          isDeleted: p.is_deleted ?? false,
          updatedAt: clientTime,
        })
        .where(and(eq(pages.id, p.id), eq(pages.ownerId, userId), isNull(pages.noteId)));
      results.push({ id: p.id, action: "updated" });
    } else {
      results.push({ id: p.id, action: "skipped" });
    }
  }

  // リンク同期 — 個人ページ間のみ
  // Link sync — personal pages only
  if (body.links?.length) {
    const sourceIds = [...new Set(body.links.map((l) => l.source_id))];
    const ownedPages = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.ownerId, userId), isNull(pages.noteId), inArray(pages.id, sourceIds)));
    const ownedIds = new Set(ownedPages.map((r) => r.id));
    for (const sourceId of sourceIds) {
      if (!ownedIds.has(sourceId)) continue;
      await db.delete(links).where(eq(links.sourceId, sourceId));
    }
    for (const link of body.links) {
      if (link.source_id === link.target_id) continue; // self-ref skip
      if (!ownedIds.has(link.source_id)) continue; // IDOR protection
      await db
        .insert(links)
        .values({
          sourceId: link.source_id,
          targetId: link.target_id,
        })
        .onConflictDoNothing();
    }
  }

  // ゴーストリンク同期 — 個人ページ間のみ
  // Ghost link sync — personal pages only
  if (body.ghost_links?.length) {
    const sourceIds = [...new Set(body.ghost_links.map((g) => g.source_page_id))];
    const ownedGhostPages = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.ownerId, userId), isNull(pages.noteId), inArray(pages.id, sourceIds)));
    const ownedGhostIds = new Set(ownedGhostPages.map((r) => r.id));
    for (const sourceId of sourceIds) {
      if (!ownedGhostIds.has(sourceId)) continue;
      await db.delete(ghostLinks).where(eq(ghostLinks.sourcePageId, sourceId));
    }
    for (const gl of body.ghost_links) {
      if (!ownedGhostIds.has(gl.source_page_id)) continue; // IDOR protection
      await db
        .insert(ghostLinks)
        .values({
          linkText: gl.link_text,
          sourcePageId: gl.source_page_id,
          originalTargetPageId: gl.original_target_page_id ?? null,
          originalNoteId: gl.original_note_id ?? null,
        })
        .onConflictDoNothing();
    }
  }

  return c.json({
    results,
    synced_at: new Date().toISOString(),
  });
});

export default app;
