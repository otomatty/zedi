import type { NoteRole, NoteVisibility } from "../../shared/types";

import { getNoteAccess } from "./access";
import { firstWithCost, type D1Cost } from "./cost";

export type { NoteRole };

/** Note details returned by the API. / API が返すノートの詳細。 */
interface NoteDetail {
  id: string;
  title: string;
  visibility: NoteVisibility;
  role: NoteRole;
}

/**
 * Returns the note details and the caller's role when they can read it.
 * 閲覧できるノートの詳細と、リクエストしたユーザーの権限を返す。
 */
export async function getNote(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<NoteDetail | null> {
  const access = await getNoteAccess(db, userId, noteId);
  if (!access) return null;
  const { title, visibility, role } = access;
  return { id: access.noteId, title, visibility, role };
}

/**
 * Updates visibility while the note still belongs to the caller.
 * 呼び出し元がノートのオーナーである場合に公開範囲を更新する。
 */
export async function setNoteVisibility(
  db: D1Database,
  ownerId: string,
  noteId: string,
  visibility: NoteVisibility,
): Promise<boolean> {
  const updated = await db
    .prepare("UPDATE notes SET visibility = ?1 WHERE id = ?2 AND owner_id = ?3 RETURNING id")
    .bind(visibility, noteId, ownerId)
    .first<{ id: string }>();
  return updated !== null;
}

/**
 * Creates the user's default note; a partial unique index keeps it to one per user.
 * ユーザーの既定ノートを作る（部分ユニーク索引で 1 人 1 つに制限）。
 */
export async function createDefaultNote(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO notes (id, owner_id, title, is_default, created_at) VALUES (?1, ?2, 'マイノート', 1, ?3) ON CONFLICT DO NOTHING",
    )
    .bind(crypto.randomUUID(), userId, Date.now())
    .run();
}

/**
 * Returns the id of the user's default note, creating it if missing.
 * 既定ノートの ID を返す（なければ作る）。
 */
export async function getDefaultNoteId(
  db: D1Database,
  userId: string,
  cost?: D1Cost,
): Promise<string> {
  const find = () =>
    firstWithCost<{ id: string }>(
      db.prepare("SELECT id FROM notes WHERE owner_id = ?1 AND is_default = 1").bind(userId),
      cost,
    );
  const existing = await find();
  if (existing) return existing.id;
  await createDefaultNote(db, userId);
  const created = await find();
  if (!created) throw new Error("default note could not be created");
  return created.id;
}

/**
 * Adds or updates a member by e-mail. Returns false when no user has that e-mail.
 * メールアドレスでメンバーを追加・更新する。該当ユーザーがいなければ false。
 */
export async function upsertMember(
  db: D1Database,
  noteId: string,
  email: string,
  role: "viewer" | "editor",
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO note_members (note_id, user_id, role)
       SELECT ?1, id, ?3 FROM user WHERE email = ?2
       ON CONFLICT (note_id, user_id) DO UPDATE SET role = excluded.role`,
    )
    .bind(noteId, email, role)
    .run();
  return result.meta.changes > 0;
}
