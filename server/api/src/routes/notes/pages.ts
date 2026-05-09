/**
 * ノートページ管理ルート
 *
 * POST   /:noteId/pages                               — ノート配下にページ新規作成（タイトル）
 * DELETE /:noteId/pages/:pageId                       — ページ削除（所属ノート一致時）
 * PUT    /:noteId/pages                               — 並び替え noop（Issue #823、`updated_at` 順を使用）
 * GET    /:noteId/pages                               — ノートのページ一覧（`pages.note_id` フィルタ）
 *
 * Issue #823 で `copy-from-personal` / `copy-to-personal` と `page_id` リンク経路は削除。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, desc } from "drizzle-orm";
import { notes, pages } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole, canEdit } from "./helpers.js";

const app = new Hono<AppEnv>();

// ── POST /:noteId/pages ─────────────────────────────────────────────────────
app.post("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const body = await c.req.json<{
    page_id?: string;
    pageId?: string;
    title?: string;
    sort_order?: number;
  }>();

  const rawPageId = body.page_id ?? body.pageId;
  const hasPageId =
    typeof rawPageId === "string" && rawPageId.trim() !== "" ? rawPageId.trim() : undefined;
  if (hasPageId) {
    throw new HTTPException(400, {
      message: "page_id linking is removed (issue #823). Create a page with title only.",
    });
  }

  const title =
    typeof body.title === "string" && body.title.trim() !== "" ? body.title.trim() : undefined;

  if (body.title !== undefined && title === undefined) {
    throw new HTTPException(400, { message: "title must be a non-empty string" });
  }
  if (!title) {
    throw new HTTPException(400, { message: "title is required" });
  }

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(pages)
      .values({
        ownerId: userId,
        noteId,
        title,
      })
      .returning();

    const newPage = inserted[0];
    if (!newPage) throw new HTTPException(500, { message: "Failed to create page" });

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
    return newPage;
  });

  return c.json({
    created: true,
    page_id: created.id,
    sort_order: 0,
  });
});

// ── DELETE /:noteId/pages/:pageId ───────────────────────────────────────────
app.delete("/:noteId/pages/:pageId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const pageId = c.req.param("pageId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  await db.transaction(async (tx) => {
    const pageRow = await tx
      .select({ id: pages.id, noteId: pages.noteId })
      .from(pages)
      .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
      .limit(1);

    const page = pageRow[0];
    if (!page) throw new HTTPException(404, { message: "Page not found" });
    if (page.noteId !== noteId) {
      throw new HTTPException(400, { message: "Page does not belong to this note" });
    }

    await tx
      .update(pages)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(pages.id, pageId));

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
  });

  return c.json({ removed: true });
});

// ── PUT /:noteId/pages (reorder noop) ───────────────────────────────────────
app.put("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const body = await c.req.json<{
    page_ids: string[];
  }>();

  if (!body.page_ids?.length) {
    throw new HTTPException(400, { message: "page_ids array is required" });
  }

  // Issue #823: sort order lives on `pages.updated_at` only; ignore payload.
  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ reordered: true });
});

// ── GET /:noteId/pages ──────────────────────────────────────────────────────
app.get("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const result = await db
    .select({
      page_id: pages.id,
      page_title: pages.title,
      page_content_preview: pages.contentPreview,
      page_thumbnail_url: pages.thumbnailUrl,
      page_updated_at: pages.updatedAt,
    })
    .from(pages)
    .where(and(eq(pages.noteId, noteId), eq(pages.isDeleted, false)))
    .orderBy(desc(pages.updatedAt));

  return c.json({ pages: result });
});

export default app;
