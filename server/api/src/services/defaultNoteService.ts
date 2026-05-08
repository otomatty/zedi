/**
 * デフォルトノート（マイノート）の生成・解決サービス。
 *
 * Default-note service. Each user owns exactly one note with
 * `notes.is_default = true` titled `<users.name>のノート`. The default note
 * replaces the previous "personal pages" concept; every page lives in some
 * note, and a user's "personal space" is their default note.
 *
 * - `ensureDefaultNote`: 冪等。既に有効な行があればその行を返し、無ければ
 *   作成する。並行呼び出しは partial unique index
 *   `idx_notes_unique_default_per_owner` により 1 件に正規化される。
 * - `getDefaultNoteOrNull`: 既存行を読み取るだけ。未作成なら null。
 *
 * - `ensureDefaultNote`: idempotent. Returns the existing live default note
 *   row, or creates and returns a new one. Concurrent callers are bounded by
 *   the partial unique index `idx_notes_unique_default_per_owner`.
 * - `getDefaultNoteOrNull`: read-only lookup; returns null when not created.
 */
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { notes, users } from "../schema/index.js";
import type { Note } from "../schema/index.js";
import type { DbOrTx } from "../lib/welcomePageService.js";

/**
 * デフォルトノートのタイトルを `<users.name>のノート` の形式で返す。
 * Format the default-note title as `<users.name>のノート`.
 *
 * @param userName - users.name に格納された表示名 / Display name from users.name
 */
export function formatDefaultNoteTitle(userName: string): string {
  return `${userName}のノート`;
}

/**
 * 指定ユーザーの有効なデフォルトノート行を返す。未作成なら null。
 * Returns the live default note row for the user, or null when not created.
 */
export async function getDefaultNoteOrNull(db: DbOrTx, userId: string): Promise<Note | null> {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.isDefault, true), eq(notes.isDeleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 指定ユーザーのデフォルトノートを保証する。既存行があればその行を返し、
 * 無ければ作成して返す。タイトルは `<users.name>のノート`。並行作成は partial
 * unique index に依拠して 1 件に正規化される（衝突した側は勝者の行を再取得する）。
 *
 * Ensure the user has a default note. Returns the existing row when present,
 * otherwise creates one titled `<users.name>のノート` and returns it. Concurrent
 * callers race cleanly via the partial unique index — the loser re-reads the
 * winner.
 *
 * @throws HTTPException 404 — `users.id` が存在しない場合
 */
export async function ensureDefaultNote(db: DbOrTx, userId: string): Promise<Note> {
  const existing = await getDefaultNoteOrNull(db, userId);
  if (existing) return existing;

  const userRow = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRow[0];
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const title = formatDefaultNoteTitle(user.name);

  const inserted = await db
    .insert(notes)
    .values({
      ownerId: userId,
      title,
      visibility: "private",
      editPermission: "owner_only",
      isDefault: true,
    })
    .onConflictDoNothing()
    .returning();

  const newRow = inserted[0];
  if (newRow) return newRow;

  // Lost the race against a concurrent ensureDefaultNote call. Read the winner.
  // 並行呼び出しに敗けた場合は勝者の行を再取得する。
  const winner = await getDefaultNoteOrNull(db, userId);
  if (winner) return winner;
  throw new HTTPException(500, {
    message: "Failed to ensure default note",
  });
}
