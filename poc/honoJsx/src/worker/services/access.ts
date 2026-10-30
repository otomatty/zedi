import type { NoteRole, PageDetail } from "../../shared/types";
import { firstWithCost, type D1Cost } from "./cost";

const ROLE_SQL = "CASE WHEN n.owner_id = ?1 THEN 'owner' ELSE m.role END";
const ACCESS_JOIN = "LEFT JOIN note_members m ON m.note_id = n.id AND m.user_id = ?1";
const ACCESS_WHERE = "(n.owner_id = ?1 OR m.user_id IS NOT NULL)";

/** A user's access to a note, including the trigger-maintained page count. */
export interface NoteAccess {
  noteId: string;
  role: NoteRole;
  pageCount: number;
}

/** A page the user can open, with their role in its note. */
export type PageAccess = PageDetail;

/**
 * Resolves the user's role in a note in one indexed query; null when they have no access.
 * ノートでの権限を 1 クエリで解決する。アクセス権がなければ null。
 */
export function getNoteAccess(
  db: D1Database,
  userId: string,
  noteId: string,
  cost?: D1Cost,
): Promise<NoteAccess | null> {
  return firstWithCost<NoteAccess>(
    db
      .prepare(
        `SELECT n.id AS noteId, n.page_count AS pageCount, ${ROLE_SQL} AS role
       FROM notes n ${ACCESS_JOIN} WHERE n.id = ?2 AND ${ACCESS_WHERE}`,
      )
      .bind(userId, noteId),
    cost,
  );
}

/**
 * Resolves a page and the user's role in its note; null when they have no access.
 * ページと、そのノートでの権限を解決する。アクセス権がなければ null。
 */
export function getPageAccess(
  db: D1Database,
  userId: string,
  pageId: string,
  cost?: D1Cost,
): Promise<PageAccess | null> {
  return firstWithCost<PageAccess>(
    db
      .prepare(
        `SELECT p.id, p.note_id AS noteId, p.title, p.preview, p.updated_at AS updatedAt, ${ROLE_SQL} AS role
       FROM pages p JOIN notes n ON n.id = p.note_id ${ACCESS_JOIN}
       WHERE p.id = ?2 AND ${ACCESS_WHERE}`,
      )
      .bind(userId, pageId),
    cost,
  );
}

/** Whether the role may create or edit pages. */
export const canEdit = (role: NoteRole) => role === "owner" || role === "editor";
