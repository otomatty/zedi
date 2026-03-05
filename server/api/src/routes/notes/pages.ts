/**
 * ノートページ管理ルート
 *
 * POST   /:noteId/pages          — ページ追加
 * DELETE /:noteId/pages/:pageId  — ページ削除
 * PUT    /:noteId/pages          — ページ並び替え
 * GET    /:noteId/pages          — ノートのページ一覧
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, asc, sql } from "drizzle-orm";
import { notes, notePages, pages } from "../../schema/index.js";
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
    page_id: string;
    sort_order?: number;
  }>();

  if (!body.page_id) {
    throw new HTTPException(400, { message: "page_id is required" });
  }

  const page = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, body.page_id), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) throw new HTTPException(404, { message: "Page not found" });

  const maxOrder = await db
    .select({ max: sql<number>`COALESCE(MAX(${notePages.sortOrder}), 0)` })
    .from(notePages)
    .where(and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false)));

  const sortOrder = body.sort_order ?? (maxOrder[0]?.max ?? 0) + 1;

  await db
    .insert(notePages)
    .values({
      noteId,
      pageId: body.page_id,
      addedByUserId: userId,
      sortOrder,
    })
    .onConflictDoUpdate({
      target: [notePages.noteId, notePages.pageId],
      set: {
        isDeleted: false,
        sortOrder,
        updatedAt: new Date(),
      },
    });

  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ added: true, sort_order: sortOrder });
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

  await db
    .update(notePages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(notePages.noteId, noteId), eq(notePages.pageId, pageId)));

  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ removed: true });
});

// ── PUT /:noteId/pages (reorder) ────────────────────────────────────────────
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

  for (let i = 0; i < body.page_ids.length; i++) {
    const pageId = body.page_ids[i];
    if (!pageId) continue;
    await db
      .update(notePages)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(and(eq(notePages.noteId, noteId), eq(notePages.pageId, pageId)));
  }

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
      page_id: notePages.pageId,
      sort_order: notePages.sortOrder,
      added_by: notePages.addedByUserId,
      page_title: pages.title,
      page_content_preview: pages.contentPreview,
      page_thumbnail_url: pages.thumbnailUrl,
      page_updated_at: pages.updatedAt,
    })
    .from(notePages)
    .innerJoin(pages, eq(notePages.pageId, pages.id))
    .where(
      and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false), eq(pages.isDeleted, false)),
    )
    .orderBy(asc(notePages.sortOrder));

  return c.json({ pages: result });
});

export default app;
