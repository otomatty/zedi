/**
 * ページアクセス権限チェックの共有サービス
 * Shared page access authorization service.
 */
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { pages, users, notes, notePages, noteMembers } from "../schema/index.js";
import type { Database } from "../types/index.js";
import { getNoteRole, canEdit } from "../routes/notes/helpers.js";

/**
 * ページの種別と所有情報。`noteId` が非 null の場合はノートネイティブページ
 * （`pages.note_id` がそのノートを指している）。
 *
 * Page kind and ownership info. `noteId !== null` means a note-native page
 * whose `pages.note_id` references that note. See issue #713.
 */
type PageOwnership = { id: string; ownerId: string; noteId: string | null };

async function getPageOwnership(db: Database, pageId: string): Promise<PageOwnership> {
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId, noteId: pages.noteId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRow = page[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });
  return pageRow;
}

async function getUserEmailLowercase(db: Database, userId: string): Promise<string> {
  const userRow = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const email = userRow[0]?.email;
  if (!email) throw new HTTPException(403, { message: "Forbidden" });
  return email.trim().toLowerCase();
}

/**
 * ページへの閲覧権限を確認する。
 *
 * - 個人ページ (`pages.note_id IS NULL`): 所有者本人、または当該ページが
 *   `note_pages` 経由で登録されているノートの受諾済みメンバー
 * - ノートネイティブページ (`pages.note_id IS NOT NULL`): そのノートに対する
 *   ロール解決（owner / member / domain / public guest）が成立すれば閲覧可。
 *   `pages.ownerId` の一致では許可しない（脱退後に閲覧権が残るのを防ぐ）
 *
 * Verify the user can view the page.
 *
 * - Personal page (`pages.note_id IS NULL`): owner of the page row, or an
 *   accepted member of any note this page is attached to via `note_pages`
 * - Note-native page (`pages.note_id IS NOT NULL`): caller must resolve to a
 *   role (owner / member / domain / public guest) on that note. Owning the
 *   underlying `pages` row is intentionally NOT enough — that would let a
 *   removed member keep reading after leaving the note.
 *
 * See issue #713.
 */
export async function assertPageViewAccess(
  db: Database,
  pageId: string,
  userId: string,
): Promise<void> {
  const pageRow = await getPageOwnership(db, pageId);

  if (pageRow.noteId) {
    const userEmail = await getUserEmailLowercase(db, userId);
    const { role } = await getNoteRole(pageRow.noteId, userId, userEmail, db);
    if (!role) throw new HTTPException(403, { message: "Forbidden" });
    return;
  }

  // 個人ページ：オーナーは常にアクセス可
  // Personal page: owner always has access
  if (pageRow.ownerId === userId) return;

  const userEmail = await getUserEmailLowercase(db, userId);

  // ページが属するノートを取得し、そのノートのメンバーかチェック
  // Find notes this page belongs to and verify user is a member
  const noteMembership = await db
    .select({ noteId: notePages.noteId })
    .from(notePages)
    .innerJoin(notes, and(eq(notes.id, notePages.noteId), eq(notes.isDeleted, false)))
    .innerJoin(
      noteMembers,
      and(
        eq(noteMembers.noteId, notePages.noteId),
        eq(noteMembers.memberEmail, userEmail),
        eq(noteMembers.isDeleted, false),
        eq(noteMembers.status, "accepted"),
      ),
    )
    .where(and(eq(notePages.pageId, pageId), eq(notePages.isDeleted, false)))
    .limit(1);

  if (noteMembership[0]) return;

  throw new HTTPException(403, { message: "Forbidden" });
}

/**
 * ページへの編集権限を確認する。
 *
 * - 個人ページ (`pages.note_id IS NULL`): 所有者本人のみ
 * - ノートネイティブページ (`pages.note_id IS NOT NULL`): そのノートに対する
 *   ロールと `note.editPermission` を `canEdit` で評価
 *
 * Verify the user can edit the page.
 *
 * - Personal page (`pages.note_id IS NULL`): owner only
 * - Note-native page (`pages.note_id IS NOT NULL`): role on that note must
 *   pass `canEdit(role, note)` (owner / editor with note permissions / public
 *   guest under `any_logged_in` rules)
 *
 * See issue #713.
 */
export async function assertPageEditAccess(
  db: Database,
  pageId: string,
  userId: string,
): Promise<void> {
  const pageRow = await getPageOwnership(db, pageId);

  if (pageRow.noteId) {
    const userEmail = await getUserEmailLowercase(db, userId);
    const { role, note } = await getNoteRole(pageRow.noteId, userId, userEmail, db);
    if (!note) throw new HTTPException(404, { message: "Note not found" });
    if (!role || !canEdit(role, note)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    return;
  }

  if (pageRow.ownerId !== userId) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
