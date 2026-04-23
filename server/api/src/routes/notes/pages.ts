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
    page_id?: string;
    pageId?: string;
    title?: string;
    sort_order?: number;
  }>();

  const rawPageId = body.page_id ?? body.pageId;
  const pageId =
    typeof rawPageId === "string" && rawPageId.trim() !== "" ? rawPageId.trim() : undefined;
  const title =
    typeof body.title === "string" && body.title.trim() !== "" ? body.title.trim() : undefined;

  if (!pageId && body.title !== undefined && title === undefined) {
    throw new HTTPException(400, { message: "title must be a non-empty string" });
  }
  if (!pageId && !title) {
    throw new HTTPException(400, { message: "page_id or title is required" });
  }

  let targetPageId: string;
  let sortOrder: number;

  if (pageId) {
    const result = await db.transaction(async (tx) => {
      const page = await tx
        .select({ id: pages.id, ownerId: pages.ownerId, noteId: pages.noteId })
        .from(pages)
        .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
        .limit(1);

      const firstPage = page[0];
      if (!firstPage) throw new HTTPException(404, { message: "Page not found" });
      if (firstPage.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });
      // 既にノートネイティブのページ（別ノートに所属）を `page_id` 経由で別ノートに
      // リンクできてしまうと、`/api/pages/:id/content` の認可は元ノート側のロールで
      // 解決されるため、リンク先メンバーから見ると「リストには出るが開けない」
      // 壊れたカードになる。Phase 1 では個人ページ（`note_id IS NULL`）のみリンク可。
      // ノート間の取り込みは Phase 3 で導入予定の copy エンドポイントで扱う。
      //
      // Reject note-native pages in the `page_id` linking path. If we let a page
      // already scoped to note A be linked into note B, then `/api/pages/:id/content`
      // still authorizes via the original `pages.note_id` → note B members would see
      // a tile they cannot open (403). In Phase 1 only personal pages
      // (`note_id IS NULL`) are linkable; cross-note adoption arrives with the
      // Phase 3 copy endpoint. See issue #713.
      if (firstPage.noteId !== null) {
        throw new HTTPException(400, {
          message: "Only personal pages can be linked via page_id",
        });
      }
      const resolvedPageId = firstPage.id;

      const maxOrder = await tx
        .select({ max: sql<number>`COALESCE(MAX(${notePages.sortOrder}), 0)` })
        .from(notePages)
        .where(and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false)));

      const order = body.sort_order ?? (maxOrder[0]?.max ?? 0) + 1;

      await tx
        .insert(notePages)
        .values({
          noteId,
          pageId: resolvedPageId,
          addedByUserId: userId,
          sortOrder: order,
        })
        .onConflictDoUpdate({
          target: [notePages.noteId, notePages.pageId],
          set: {
            isDeleted: false,
            sortOrder: order,
            updatedAt: new Date(),
          },
        });

      await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
      return { sortOrder: order };
    });
    sortOrder = result.sortOrder;
  } else {
    const result = await db.transaction(async (tx) => {
      // 「タイトルだけで新規作成」経路はノートネイティブページを直接作る。
      // `note_id` を埋めることで個人ホーム (note_id IS NULL フィルタ) には現れず、
      // ノート削除時に ON DELETE CASCADE で一緒に消える。Issue #713 を参照。
      //
      // The "create from title" path generates a note-native page directly.
      // Setting `note_id` keeps it out of the personal-home listing
      // (`note_id IS NULL` filter) and lets ON DELETE CASCADE remove it
      // alongside the note. See issue #713.
      const created = await tx
        .insert(pages)
        .values({
          ownerId: userId,
          noteId,
          title: title ?? null,
        })
        .returning();

      const newPage = created[0];
      if (!newPage) throw new HTTPException(500, { message: "Failed to create page" });
      const newPageId = newPage.id;

      const maxOrder = await tx
        .select({ max: sql<number>`COALESCE(MAX(${notePages.sortOrder}), 0)` })
        .from(notePages)
        .where(and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false)));

      const order = body.sort_order ?? (maxOrder[0]?.max ?? 0) + 1;

      await tx
        .insert(notePages)
        .values({
          noteId,
          pageId: newPageId,
          addedByUserId: userId,
          sortOrder: order,
        })
        .onConflictDoUpdate({
          target: [notePages.noteId, notePages.pageId],
          set: {
            isDeleted: false,
            sortOrder: order,
            updatedAt: new Date(),
          },
        });

      await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
      return { sortOrder: order };
    });
    sortOrder = result.sortOrder;
  }

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

  // ノートからページを外す。ノートネイティブページ（`pages.note_id = noteId`）の場合は
  // `note_pages` の論理削除だけだと `pages` 行が残り、`/api/pages/:id/content` などが
  // ノートロール経由で引き続き認可してしまう（孤児化）。同一トランザクション内で
  // `pages` 自体も論理削除して整合性を保つ。
  // 個人ページ（`pages.note_id IS NULL`）のリンク解除は従来どおり `note_pages` だけを
  // 落とし、ページ自体は所有者の個人 /home に残す。
  //
  // Detach a page from a note. For note-native pages
  // (`pages.note_id = noteId`), tombstoning only `note_pages` would leave the
  // `pages` row alive and still authorized via the note role on
  // `/api/pages/:id/content`, etc. Soft-delete the `pages` row in the same
  // transaction so the orphan goes away. For personal pages (`note_id IS NULL`)
  // we still only drop the link row so the page stays on the owner's /home.
  // See issue #713.
  await db.transaction(async (tx) => {
    const pageRow = await tx
      .select({ id: pages.id, noteId: pages.noteId })
      .from(pages)
      .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
      .limit(1);

    await tx
      .update(notePages)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(notePages.noteId, noteId), eq(notePages.pageId, pageId)));

    const page = pageRow[0];
    if (page && page.noteId === noteId) {
      await tx
        .update(pages)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(pages.id, pageId));
    }

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
  });

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
