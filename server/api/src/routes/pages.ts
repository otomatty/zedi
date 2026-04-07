/**
 * /api/pages — ページ CRUD + コンテンツ管理
 *
 * GET    /api/pages/:id/content — Y.Doc コンテンツ取得（`page_contents` 行が未作成の空ページは 200 + 空 ydoc）
 *        — Retrieve Y.Doc content (200 + empty `ydoc_state` when no `page_contents` row).
 * PUT    /api/pages/:id/content — Y.Doc コンテンツ更新 (楽観的ロック) / Update with optimistic locking
 * POST   /api/pages             — 新規ページ作成 / Create page
 * DELETE /api/pages/:id         — ページ論理削除 / Soft-delete page
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, sql } from "drizzle-orm";
import { pages, pageContents } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv, Database } from "../types/index.js";
import { maybeCreateSnapshot } from "../services/snapshotService.js";

/**
 * ベストエフォートで自動スナップショットを作成する。失敗してもメイン処理には影響しない。
 * Best-effort auto-snapshot creation. Failures are logged but never propagate.
 */
async function tryAutoSnapshot(
  db: Database,
  pageId: string,
  ydocState: Buffer,
  contentText: string | null,
  version: number,
  userId: string,
): Promise<void> {
  try {
    await maybeCreateSnapshot(db, pageId, ydocState, contentText, version, userId);
  } catch (error) {
    console.error(`[Snapshot] Failed to create auto-snapshot for page ${pageId}:`, error);
  }
}

const app = new Hono<AppEnv>();

/**
 * PUT /content リクエストから pages テーブルの更新セットを構築し、変更があれば適用する。
 * Build and apply pages-table updates (title, content_preview, updated_at) from PUT body.
 */
async function applyPagesMetadataUpdate(
  db: { update: Database["update"] },
  pageId: string,
  body: { title?: string; content_preview?: string },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.content_preview !== undefined) set.contentPreview = body.content_preview;
  if (Object.keys(set).length === 0) return;
  set.updatedAt = new Date();
  await db.update(pages).set(set).where(eq(pages.id, pageId));
}

// ── GET /pages/:id/content ──────────────────────────────────────────────────
app.get("/:id/content", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  // ページ所有者確認
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRow = page[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });
  if (pageRow.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });

  // コンテンツ取得
  const content = await db
    .select()
    .from(pageContents)
    .where(eq(pageContents.pageId, pageId))
    .limit(1);

  const row = content[0];
  if (!row) {
    return c.json({
      ydoc_state: "",
      version: 0,
      content_text: null,
    });
  }
  const ydocBase64 =
    row.ydocState instanceof Buffer
      ? row.ydocState.toString("base64")
      : typeof row.ydocState === "string"
        ? row.ydocState
        : Buffer.from(row.ydocState as unknown as ArrayBufferLike).toString("base64");

  return c.json({
    ydoc_state: ydocBase64,
    version: row.version,
    content_text: row.contentText,
    updated_at: row.updatedAt?.toISOString(),
  });
});

// ── PUT /pages/:id/content ──────────────────────────────────────────────────
app.put("/:id/content", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    ydoc_state: string; // base64-encoded Y.Doc state
    expected_version?: number;
    content_text?: string;
    content_preview?: string;
    title?: string;
  }>();

  // Allow "" so clients can round-trip GET (empty ydoc_state) with PUT + expected_version.
  // GET が ydoc_state: "" を返した場合もそのまま初回保存できるようにする。
  if (body.ydoc_state === undefined || body.ydoc_state === null) {
    throw new HTTPException(400, { message: "ydoc_state is required" });
  }

  // ページ所有者確認
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRow = page[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });
  if (pageRow.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });

  const ydocBuffer = Buffer.from(body.ydoc_state, "base64");

  // UPSERT page_contents with optimistic locking
  if (body.expected_version != null) {
    // First save after GET returned version 0 with no row: insert the initial row.
    // GET が page_contents 未作成で version:0 を返した契約に合わせ、expected_version:0 で初回 INSERT を許容する。
    if (body.expected_version === 0) {
      const firstSave = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(pageContents)
          .values({
            pageId,
            ydocState: ydocBuffer,
            version: 1,
            contentText: body.content_text ?? null,
          })
          .onConflictDoNothing({ target: pageContents.pageId })
          .returning();

        if (!inserted.length) {
          return { done: false as const };
        }

        const insertedRow = inserted[0];
        if (!insertedRow) throw new HTTPException(500, { message: "Insert failed" });

        await applyPagesMetadataUpdate(tx, pageId, body);

        return { done: true as const, version: insertedRow.version ?? 1 };
      });

      if (firstSave.done) {
        return c.json({ version: firstSave.version });
      }
    }

    // 楽観的ロック: expected_version と一致する場合のみ更新
    const updated = await db
      .update(pageContents)
      .set({
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(pageContents.pageId, pageId), eq(pageContents.version, body.expected_version)))
      .returning();

    if (!updated.length) {
      // バージョン不一致: 現在のバージョンを返す
      const current = await db
        .select({ version: pageContents.version })
        .from(pageContents)
        .where(eq(pageContents.pageId, pageId))
        .limit(1);

      throw new HTTPException(409, {
        message: `Version conflict. Current version: ${current[0]?.version ?? 0}`,
      });
    }

    const updatedRow = updated[0];
    if (!updatedRow) throw new HTTPException(500, { message: "Update failed" });

    await applyPagesMetadataUpdate(db, pageId, body);

    await tryAutoSnapshot(
      db,
      pageId,
      ydocBuffer,
      body.content_text ?? null,
      updatedRow.version ?? 0,
      userId,
    );

    return c.json({ version: updatedRow.version ?? 0 });
  }

  // No optimistic locking: UPSERT
  const result = await db
    .insert(pageContents)
    .values({
      pageId,
      ydocState: ydocBuffer,
      version: 1,
      contentText: body.content_text ?? null,
    })
    .onConflictDoUpdate({
      target: pageContents.pageId,
      set: {
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await applyPagesMetadataUpdate(db, pageId, body);

  const resultRow = result[0];
  if (!resultRow) throw new HTTPException(500, { message: "Upsert failed" });

  await tryAutoSnapshot(
    db,
    pageId,
    ydocBuffer,
    body.content_text ?? null,
    resultRow.version ?? 0,
    userId,
  );

  return c.json({ version: resultRow.version });
});

// ── POST /pages ─────────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    title?: string;
    content_preview?: string;
    source_page_id?: string;
    source_url?: string;
    thumbnail_url?: string | null;
  }>();

  const result = await db
    .insert(pages)
    .values({
      ownerId: userId,
      title: body.title ?? null,
      contentPreview: body.content_preview ?? null,
      sourcePageId: body.source_page_id ?? null,
      sourceUrl: body.source_url ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
    })
    .returning();

  const row = result[0];
  if (!row) throw new HTTPException(500, { message: "Insert failed" });
  return c.json(
    {
      id: row.id,
      owner_id: row.ownerId,
      source_page_id: row.sourcePageId ?? null,
      title: row.title ?? null,
      content_preview: row.contentPreview ?? null,
      thumbnail_url: row.thumbnailUrl ?? null,
      source_url: row.sourceUrl ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      is_deleted: row.isDeleted,
    },
    201,
  );
});

// ── DELETE /pages/:id ───────────────────────────────────────────────────────
app.delete("/:id", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRow = page[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });
  if (pageRow.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });

  await db
    .update(pages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(pages.id, pageId));

  return c.json({ id: pageId, deleted: true });
});

export default app;
