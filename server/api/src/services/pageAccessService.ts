/**
 * ページアクセス権限チェックの共有サービス
 * Shared page access authorization service.
 */
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { pages, users } from "../schema/index.js";
import type { Database } from "../types/index.js";
import { getNoteRole, canEdit } from "../routes/notes/helpers.js";

/**
 * ページの種別と所有情報。Issue #823 以降 `noteId` は常に非 null。
 *
 * Page kind and ownership info. After issue #823 `noteId` is always set.
 */
type PageOwnership = { id: string; ownerId: string; noteId: string };

async function getPageOwnership(db: Database, pageId: string): Promise<PageOwnership> {
  const page = await db
    .select({ id: pages.id, ownerId: pages.ownerId, noteId: pages.noteId })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const pageRows = Array.isArray(page) ? page : [];
  const pageRow = pageRows[0];
  if (!pageRow) throw new HTTPException(404, { message: "Page not found" });
  return pageRow as PageOwnership;
}

async function getUserEmailLowercase(db: Database, userId: string): Promise<string> {
  const userRow = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const rows = Array.isArray(userRow) ? userRow : [];
  const email = rows[0]?.email;
  if (!email) throw new HTTPException(403, { message: "Forbidden" });
  return email.trim().toLowerCase();
}

/**
 * ページへの閲覧権限を確認する。
 *
 * すべてのページは `pages.note_id` でノートに所属する。閲覧はそのノートに対する
 * `getNoteRole` が成立すれば可。`pages.ownerId` の一致だけでは許可しない（脱退後に
 * 閲覧権が残るのを防ぐ）。
 *
 * Verify the user can view the page. Every page belongs to a note via
 * `pages.note_id`; the caller needs any resolved note role on that note.
 * Owning the `pages` row alone is intentionally NOT enough.
 *
 * See issue #823.
 */
export async function assertPageViewAccess(
  db: Database,
  pageId: string,
  userId: string,
): Promise<void> {
  const pageRow = await getPageOwnership(db, pageId);

  const userEmail = await getUserEmailLowercase(db, userId);
  const { role } = await getNoteRole(pageRow.noteId, userId, userEmail, db);
  if (!role) throw new HTTPException(403, { message: "Forbidden" });
}

/**
 * ページへの編集権限を確認する。
 *
 * 所属ノートに対するロールと `note.editPermission` を `canEdit` で評価する。
 *
 * Verify the user can edit via `canEdit(role, note)` on the owning note.
 *
 * See issue #823.
 */
export async function assertPageEditAccess(
  db: Database,
  pageId: string,
  userId: string,
): Promise<void> {
  const pageRow = await getPageOwnership(db, pageId);

  const userEmail = await getUserEmailLowercase(db, userId);
  const { role, note } = await getNoteRole(pageRow.noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
