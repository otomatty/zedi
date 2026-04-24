/**
 * ノートページ管理ルート
 *
 * POST   /:noteId/pages                               — ページ追加（リンク or タイトル新規）
 * POST   /:noteId/pages/copy-from-personal/:pageId    — 個人ページをノートにコピー
 * POST   /:noteId/pages/:pageId/copy-to-personal      — ノートページを個人にコピー
 * DELETE /:noteId/pages/:pageId                       — ページ削除
 * PUT    /:noteId/pages                               — ページ並び替え
 * GET    /:noteId/pages                               — ノートのページ一覧
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, asc, sql } from "drizzle-orm";
import { notes, notePages, pages, pageContents } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv, Database } from "../../types/index.js";
import { getNoteRole, canEdit } from "./helpers.js";

const app = new Hono<AppEnv>();

/**
 * コピー時に引き継ぐページメタデータのサブセット。
 * Source-page metadata subset that copy endpoints duplicate into the new row.
 */
interface CopyablePageMetadata {
  title: string | null;
  contentPreview: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
}

/**
 * コピーで作られた新ページ行をレスポンスに載せるときの形。クライアントは
 * これを IndexedDB に書き戻して `/home` に即反映する（`copy-to-personal`）。
 * Shape of a copied page row in copy endpoint responses. Clients write it
 * through to IndexedDB so the new page surfaces on `/home` without waiting
 * for the next sync.
 */
interface CopiedPageApiItem {
  id: string;
  owner_id: string;
  note_id: string | null;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * ページ行と `page_contents` を新しい `pages` 行へコピーする共通ヘルパー。
 *
 * `copy-from-personal`（個人 → ノート）と `copy-to-personal`（ノート → 個人）の
 * 両エンドポイントで共有する。呼び出し側でスコープ判定とソース取得を済ませ、
 * ここでは「新しい行を作る」部分だけに責務を絞る。`page_contents` がない
 * （= 初回保存前の）ソースはスキップし、コピー先の初回保存時に通常ルートで
 * 作成させる。新しい行は `RETURNING *` で取り出してレスポンスに載せられる
 * 形で返すので、クライアントはサーバー再問い合わせなしにローカルストレージへ
 * 書き戻せる。
 *
 * Shared helper that clones the page row + `page_contents` into a brand new
 * `pages` row. Shared between `copy-from-personal` and `copy-to-personal` so
 * the two endpoints stop duplicating this block. The caller handles
 * authorization / source fetching; this helper only performs the insert. If
 * the source has no `page_contents` row (never saved), that step is skipped
 * and the destination creates its own row on first save via the usual PUT
 * content path. The helper returns the full new row so endpoints can include
 * it in the response and clients can write through to local storage without
 * a follow-up round trip. See issue #713 Phase 3.
 */
async function copyPageRowWithContent(
  tx: Database,
  params: {
    ownerId: string;
    /** `null` で個人ページ、UUID でそのノートのノートネイティブページ */
    destinationNoteId: string | null;
    sourcePageId: string;
    sourceMetadata: CopyablePageMetadata;
  },
): Promise<{ pageId: string; page: CopiedPageApiItem }> {
  const inserted = await tx
    .insert(pages)
    .values({
      ownerId: params.ownerId,
      noteId: params.destinationNoteId,
      sourcePageId: params.sourcePageId,
      title: params.sourceMetadata.title ?? null,
      contentPreview: params.sourceMetadata.contentPreview ?? null,
      thumbnailUrl: params.sourceMetadata.thumbnailUrl ?? null,
      sourceUrl: params.sourceMetadata.sourceUrl ?? null,
    })
    .returning();

  const newPage = inserted[0];
  if (!newPage) throw new HTTPException(500, { message: "Failed to create page" });
  const newPageId = newPage.id;

  const sourceContent = await tx
    .select({ ydocState: pageContents.ydocState, contentText: pageContents.contentText })
    .from(pageContents)
    .where(eq(pageContents.pageId, params.sourcePageId))
    .limit(1);

  const contentRow = sourceContent[0];
  if (contentRow) {
    await tx.insert(pageContents).values({
      pageId: newPageId,
      ydocState: contentRow.ydocState,
      version: 1,
      contentText: contentRow.contentText ?? null,
    });
  }

  const pageApi: CopiedPageApiItem = {
    id: newPage.id,
    owner_id: newPage.ownerId,
    note_id: newPage.noteId,
    source_page_id: newPage.sourcePageId,
    title: newPage.title,
    content_preview: newPage.contentPreview,
    thumbnail_url: newPage.thumbnailUrl,
    source_url: newPage.sourceUrl,
    created_at: newPage.createdAt.toISOString(),
    updated_at: newPage.updatedAt.toISOString(),
    is_deleted: newPage.isDeleted,
  };

  return { pageId: newPageId, page: pageApi };
}

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

// ── POST /:noteId/pages/copy-from-personal/:pageId ──────────────────────────
// 個人ページ（`pages.note_id IS NULL`）をコピーし、指定ノート配下のノート
// ネイティブページ（`note_id = :noteId`, `source_page_id = :pageId`）を作る。
// 元ページは個人 /home に残り、新しいコピーだけがノートに出る。Issue #713 Phase 3。
//
// Copy a personal page (`pages.note_id IS NULL`) into the note as a fresh
// note-native page (`note_id = :noteId`, `source_page_id = :pageId`). The
// original stays on the caller's /home; only the copy lives inside the note.
// See issue #713 Phase 3.
app.post("/:noteId/pages/copy-from-personal/:pageId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const sourcePageId = c.req.param("pageId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const result = await db.transaction(async (tx) => {
    const sourceRows = await tx
      .select({
        id: pages.id,
        ownerId: pages.ownerId,
        noteId: pages.noteId,
        title: pages.title,
        contentPreview: pages.contentPreview,
        thumbnailUrl: pages.thumbnailUrl,
        sourceUrl: pages.sourceUrl,
      })
      .from(pages)
      .where(and(eq(pages.id, sourcePageId), eq(pages.isDeleted, false)))
      .limit(1);

    const source = sourceRows[0];
    if (!source) throw new HTTPException(404, { message: "Source page not found" });
    // 個人ページのみコピー元に許す。他人の個人ページや、すでにノートネイティブな
    // ページは Phase 3 の「個人 → ノート」スコープ外（別ノートからの取り込みは別 API）。
    // Only the caller's own personal page can be the source for
    // copy-from-personal. Cross-note adoption needs a different endpoint.
    if (source.ownerId !== userId) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (source.noteId !== null) {
      throw new HTTPException(400, { message: "Source page must be a personal page" });
    }

    const { pageId: newPageId, page: newPage } = await copyPageRowWithContent(tx, {
      ownerId: userId,
      destinationNoteId: noteId,
      sourcePageId: source.id,
      sourceMetadata: source,
    });

    const maxOrder = await tx
      .select({ max: sql<number>`COALESCE(MAX(${notePages.sortOrder}), 0)` })
      .from(notePages)
      .where(and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false)));

    const order = (maxOrder[0]?.max ?? 0) + 1;

    await tx.insert(notePages).values({
      noteId,
      pageId: newPageId,
      addedByUserId: userId,
      sortOrder: order,
    });

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

    return { pageId: newPageId, sortOrder: order, page: newPage };
  });

  return c.json({
    created: true,
    page_id: result.pageId,
    sort_order: result.sortOrder,
    page: result.page,
  });
});

// ── POST /:noteId/pages/:pageId/copy-to-personal ────────────────────────────
// ノートネイティブページ（`pages.note_id = :noteId`）の内容をコピーして
// 呼び出し元の個人ページ（`note_id = NULL`, `source_page_id = :pageId`）を作る。
// 元ページはノートに残り、コピーだけが個人 /home に出る。脱退後もコピーは残る。
// Issue #713 Phase 3。
//
// Copy a note-native page (`pages.note_id = :noteId`) into the caller's
// personal pages as a fresh row (`note_id = NULL`, `source_page_id = :pageId`).
// The original stays in the note; only the copy lands on the caller's /home,
// and the copy survives if the caller later leaves the note. See issue #713.
app.post("/:noteId/pages/:pageId/copy-to-personal", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const sourcePageId = c.req.param("pageId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  // 呼び出し元がノートを閲覧できることを確認する。`role` が解決できれば
  // owner / member / domain / guest のいずれかに該当し、対応する個人コピーの
  // 作成を許可する。`getNoteRole` 内部で `findActiveNoteById` まで引くので
  // note 存在チェックを兼ねる。
  //
  // Verify the caller can read this note (any resolved role — owner / member /
  // domain / guest — is sufficient to take a personal copy). `getNoteRole`
  // internally hits `findActiveNoteById`, which doubles as the 404 guard.
  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const result = await db.transaction(async (tx) => {
    const sourceRows = await tx
      .select({
        id: pages.id,
        noteId: pages.noteId,
        title: pages.title,
        contentPreview: pages.contentPreview,
        thumbnailUrl: pages.thumbnailUrl,
        sourceUrl: pages.sourceUrl,
      })
      .from(pages)
      .where(and(eq(pages.id, sourcePageId), eq(pages.isDeleted, false)))
      .limit(1);

    const source = sourceRows[0];
    if (!source) throw new HTTPException(404, { message: "Source page not found" });
    // URL のノート ID と実際のページ所属が食い違う場合は拒否する。これによって、
    // 別ノートのページ ID を使ってこのノートの閲覧権で取り込もうとする行為を封じる。
    // Reject if the URL note and the page's own note diverge. Otherwise a caller
    // with access to note A could pass a page id from note B and launder its
    // contents into their personal /home.
    if (source.noteId !== noteId) {
      throw new HTTPException(400, { message: "Page does not belong to this note" });
    }

    return copyPageRowWithContent(tx, {
      ownerId: userId,
      destinationNoteId: null,
      sourcePageId: source.id,
      sourceMetadata: source,
    });
  });

  return c.json({ created: true, page_id: result.pageId, page: result.page });
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
