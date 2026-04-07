/**
 * ページアクセス権限チェックの共有サービス
 * Shared page access authorization service.
 */
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { pages, users, notePages, noteMembers } from "../schema/index.js";
import type { Database } from "../types/index.js";

/**
 * ページへの閲覧権限を確認する。所有者またはノートメンバーであればアクセス可能。
 * Verify the user can view the page (owner or note member).
 *
 * Hocuspocus の `canEditNotePage` に準拠し、`note_members` を JOIN して
 * 現在のユーザーが当該ノートのメンバーであることを検証する。
 * Mirrors the Hocuspocus `canEditNotePage` logic: JOINs `note_members`
 * to verify the current user is a member of the note.
 */
export async function assertPageViewAccess(
  db: Database,
  pageId: string,
  userId: string,
): Promise<void> {
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRow = page[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });

  // オーナーはアクセス可 / Owner always has access
  if (pageRow.ownerId === userId) return;

  // ユーザーの email を取得 / Get user email for note_members lookup
  const userRow = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow[0]) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const userEmail = userRow[0].email.trim().toLowerCase();

  // ページが属するノートを取得し、そのノートのメンバーかチェック
  // Find notes this page belongs to and verify user is a member
  const noteMembership = await db
    .select({ noteId: notePages.noteId })
    .from(notePages)
    .innerJoin(
      noteMembers,
      and(
        eq(noteMembers.noteId, notePages.noteId),
        eq(noteMembers.memberEmail, userEmail),
        eq(noteMembers.isDeleted, false),
      ),
    )
    .where(and(eq(notePages.pageId, pageId), eq(notePages.isDeleted, false)))
    .limit(1);

  if (noteMembership[0]) return;

  throw new HTTPException(403, { message: "Forbidden" });
}
