import type { NoteRole, NoteVisibility, PageDetail } from "../../shared/types";
import { firstWithCost, type D1Cost } from "./cost";

function accessSql(userId: "?1" | "u.value") {
  return {
    role: `CASE WHEN n.owner_id = ${userId} THEN 'owner' ELSE COALESCE(m.role, 'viewer') END`,
    join: `LEFT JOIN note_members m ON m.note_id = n.id AND m.user_id = ${userId}`,
    where: `(n.owner_id = ${userId} OR m.user_id IS NOT NULL OR n.visibility IN ('unlisted', 'public'))`,
  };
}

const singleUser = accessSql("?1");
const batchUsers = accessSql("u.value");

/** A user's access to a note, including the trigger-maintained page count. */
export interface NoteAccess {
  noteId: string;
  title: string;
  visibility: NoteVisibility;
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
        `SELECT n.id AS noteId, n.title, n.visibility, n.page_count AS pageCount, ${singleUser.role} AS role
       FROM notes n ${singleUser.join} WHERE n.id = ?2 AND ${singleUser.where}`,
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
        `SELECT p.id, p.note_id AS noteId, p.title, p.preview, p.updated_at AS updatedAt, ${singleUser.role} AS role
       FROM pages p JOIN notes n ON n.id = p.note_id ${singleUser.join}
       WHERE p.id = ?2 AND ${singleUser.where}`,
      )
      .bind(userId, pageId),
    cost,
  );
}

/**
 * Resolves all eligible users' roles for the page in one query.
 * ページにアクセスできるユーザーの権限を 1 クエリでまとめて取得する。
 */
export async function getPageRoles(
  db: D1Database,
  pageId: string,
  userIds: readonly string[],
): Promise<Map<string, NoteRole>> {
  if (userIds.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT u.value AS userId, ${batchUsers.role} AS role
       FROM pages p JOIN notes n ON n.id = p.note_id
       CROSS JOIN json_each(?1) u ${batchUsers.join}
       WHERE p.id = ?2 AND ${batchUsers.where}`,
    )
    .bind(JSON.stringify(userIds), pageId)
    .all<{ userId: string; role: NoteRole }>();
  return new Map(results.map(({ userId, role }) => [userId, role]));
}

/** Whether the role may create or edit pages. */
export const canEdit = (role: NoteRole): boolean => role === "owner" || role === "editor";
