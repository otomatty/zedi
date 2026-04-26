/**
 * /api/sync/pages — ページ同期 (LWW)
 *
 * GET  /api/sync/pages  — 差分ページ取得 (since クエリパラメータ)
 * POST /api/sync/pages  — ページ + リンク バルク同期
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, gt, inArray, isNull } from "drizzle-orm";
import { pages, links, ghostLinks, LINK_TYPES, type LinkType } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

/**
 * `body.links` / `body.ghost_links` で受け取った `link_type` を正規化する。
 * 未指定は `'wiki'`（issue #725 マイグレーション前の既定値）にフォールバック。
 * 許可されない値は 400 で拒否する。
 *
 * Normalize the `link_type` received on wire. Omitted fields fall back to
 * `'wiki'` for legacy-client compatibility; unknown values raise HTTP 400.
 */
function normalizeLinkType(value: unknown): LinkType {
  if (value === undefined || value === null) return "wiki";
  if (typeof value === "string" && (LINK_TYPES as readonly string[]).includes(value)) {
    return value as LinkType;
  }
  throw new HTTPException(400, {
    message: `Invalid link_type: ${JSON.stringify(value)}. Expected one of ${LINK_TYPES.join(", ")}.`,
  });
}

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
      // `link_type` は issue #725 で導入。未マイグレ行は DB 側の既定で 'wiki'。
      // Added by issue #725; legacy rows are backfilled to 'wiki' by the DB default.
      link_type: l.linkType,
      created_at: l.createdAt.toISOString(),
    })),
    ghost_links: ghostLinksRows.map((g) => ({
      link_text: g.linkText,
      source_page_id: g.sourcePageId,
      link_type: g.linkType,
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
      /**
       * `link_type` は WikiLink (`'wiki'`) とタグ (`'tag'`) を区別する。
       * 省略時は `'wiki'` として扱う（issue #725 導入前の既定値）。
       * `link_type` distinguishes WikiLink (`'wiki'`) from Tag (`'tag'`);
       * omitted → `'wiki'` for legacy client compatibility (issue #725).
       */
      link_type?: string;
    }>;
    ghost_links?: Array<{
      link_text: string;
      source_page_id: string;
      /** 同上 / Same contract as above. */
      link_type?: string;
      original_target_page_id?: string;
      original_note_id?: string;
    }>;
  }>();

  if (!body.pages?.length) {
    throw new HTTPException(400, { message: "pages array is required" });
  }

  // `link_type` を先行バリデーションして、DB 書き込み前に不正値を弾く。
  // Validate `link_type` up front so bad input never reaches DB writes.
  const incomingLinks = (body.links ?? []).map((l) => ({
    ...l,
    link_type: normalizeLinkType(l.link_type),
  }));
  const incomingGhostLinks = (body.ghost_links ?? []).map((g) => ({
    ...g,
    link_type: normalizeLinkType(g.link_type),
  }));

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
  // クライアント側のリトライや誤ったペイロードで `body.pages` に同じ id が
  // 複数入る場合がある。bulk-fetch で得たスナップショットは「リクエスト到着前
  // の DB 状態」なので、ループ内で更新せず無加工に流すと:
  //   - 新規 id の 2 回目の occurrence で再度 insert → PK 衝突 (500)
  //   - 既存 id の 2 回目以降は古い updatedAt と比較 → LWW の順序が崩れる
  // 対策として (1) 入力を id ごとに updated_at 最新のものへ畳み込み、
  // (2) DML を発行するたび existingMap も更新して in-request の状態を保つ。
  //
  // Duplicate ids in `body.pages` (client retries / bad payloads) would break
  // the bulk-prefetched snapshot: a new id would re-insert and collide on PK
  // (500), and an existing id would be compared against a stale `updatedAt`,
  // breaking LWW ordering. Defend by (1) collapsing duplicates to the newest
  // `updated_at` per id, and (2) updating `existingMap` after every DML so the
  // in-request state stays consistent.
  const latestIncomingById = new Map<string, (typeof body.pages)[number]>();
  for (const p of body.pages) {
    const prev = latestIncomingById.get(p.id);
    if (!prev || new Date(p.updated_at) > new Date(prev.updated_at)) {
      latestIncomingById.set(p.id, p);
    }
  }

  const incomingIds = [...latestIncomingById.keys()];
  type ExistingRow = {
    id: string;
    ownerId: string;
    noteId: string | null;
    updatedAt: Date;
  };
  const existingRows: ExistingRow[] =
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
  const existingMap = new Map<string, ExistingRow>(existingRows.map((row) => [row.id, row]));

  for (const p of latestIncomingById.values()) {
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
      // 後続イテレーション（同 id の重複が dedupe をすり抜けた場合の保険）が
      // 再 insert に走らないようマップを更新しておく。
      // Track the just-inserted row so any later iteration sees current state.
      existingMap.set(p.id, {
        id: p.id,
        ownerId: userId,
        noteId: null,
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
      existingMap.set(p.id, { ...existing, updatedAt: clientTime });
      results.push({ id: p.id, action: "updated" });
    } else {
      results.push({ id: p.id, action: "skipped" });
    }
  }

  // リンク同期 — 個人ページ間のみ
  // Link sync — personal pages only
  //
  // issue #725: DELETE は `(source_id, link_type)` ペア単位でスコープする。
  // これにより、タグ同期時に WikiLink エッジを、あるいはその逆を巻き添え削除
  // しない。body に現れなかった `link_type` のエッジには触れない（従来の
  // 「push に現れない source_id は触らない」セマンティクスを link_type 方向
  // にも拡張した形）。
  //
  // issue #725: DELETE is scoped per `(source_id, link_type)` pair so that
  // tag sync cannot wipe wiki edges (and vice versa). A `link_type` that does
  // not appear in the push is left untouched, extending the existing
  // "missing source_id → no delete" semantics along the link_type axis.
  if (incomingLinks.length > 0) {
    const sourceIds = [...new Set(incomingLinks.map((l) => l.source_id))];
    const ownedPages = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.ownerId, userId), isNull(pages.noteId), inArray(pages.id, sourceIds)));
    const ownedIds = new Set(ownedPages.map((r) => r.id));

    const deletePairs = new Set<string>();
    for (const link of incomingLinks) {
      if (!ownedIds.has(link.source_id)) continue;
      const key = `${link.source_id} ${link.link_type}`;
      if (deletePairs.has(key)) continue;
      deletePairs.add(key);
      await db
        .delete(links)
        .where(and(eq(links.sourceId, link.source_id), eq(links.linkType, link.link_type)));
    }

    for (const link of incomingLinks) {
      if (link.source_id === link.target_id) continue; // self-ref skip
      if (!ownedIds.has(link.source_id)) continue; // IDOR protection
      await db
        .insert(links)
        .values({
          sourceId: link.source_id,
          targetId: link.target_id,
          linkType: link.link_type,
        })
        .onConflictDoNothing();
    }
  }

  // ゴーストリンク同期 — 個人ページ間のみ
  // Ghost link sync — personal pages only (同じ link_type スコープ化方針)
  if (incomingGhostLinks.length > 0) {
    const sourceIds = [...new Set(incomingGhostLinks.map((g) => g.source_page_id))];
    const ownedGhostPages = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.ownerId, userId), isNull(pages.noteId), inArray(pages.id, sourceIds)));
    const ownedGhostIds = new Set(ownedGhostPages.map((r) => r.id));

    const deletePairs = new Set<string>();
    for (const gl of incomingGhostLinks) {
      if (!ownedGhostIds.has(gl.source_page_id)) continue;
      const key = `${gl.source_page_id} ${gl.link_type}`;
      if (deletePairs.has(key)) continue;
      deletePairs.add(key);
      await db
        .delete(ghostLinks)
        .where(
          and(
            eq(ghostLinks.sourcePageId, gl.source_page_id),
            eq(ghostLinks.linkType, gl.link_type),
          ),
        );
    }

    for (const gl of incomingGhostLinks) {
      if (!ownedGhostIds.has(gl.source_page_id)) continue; // IDOR protection
      await db
        .insert(ghostLinks)
        .values({
          linkText: gl.link_text,
          sourcePageId: gl.source_page_id,
          linkType: gl.link_type,
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
