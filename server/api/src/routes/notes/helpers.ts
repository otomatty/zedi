/**
 * ノート API のヘルパー関数
 * マッパー、DB クエリ、権限チェック
 */
import { HTTPException } from "hono/http-exception";
import { eq, and, sql, inArray } from "drizzle-orm";
import { notes, noteMembers, noteDomainAccess, pages, users } from "../../schema/index.js";
import type { Note } from "../../schema/index.js";
import type { Database } from "../../types/index.js";
import type { NoteApiFields, NoteRole, NoteMemberRole } from "./types.js";
import { extractEmailDomain } from "../../lib/freeEmailDomains.js";

// ── Mappers ─────────────────────────────────────────────────────────────────

/**
 * Maps a DB note row to API snake_case fields.
 * DB のノート行を API 用の snake_case フィールドへ変換する。
 */
export function noteRowToApi(note: Note): NoteApiFields {
  return {
    id: note.id,
    owner_id: note.ownerId,
    title: note.title,
    visibility: note.visibility,
    edit_permission: note.editPermission,
    is_official: note.isOfficial,
    is_default: note.isDefault,
    view_count: note.viewCount,
    show_tag_filter_bar: note.showTagFilterBar,
    default_filter_tags: note.defaultFilterTags,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    is_deleted: note.isDeleted,
  };
}

// ── DB Helpers ──────────────────────────────────────────────────────────────

/**
 * Returns a non-deleted note by id, or null.
 * 削除されていないノートを id で取得する。なければ null。
 */
export async function findActiveNoteById(db: Database, noteId: string): Promise<Note | null> {
  const result = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Ensures the user owns the note; returns the note row.
 * ユーザーがノートの所有者であることを検証し、行を返す。
 *
 * @throws HTTPException 404 if missing, 403 if not owner
 */
export async function requireNoteOwner(
  db: Database,
  noteId: string,
  userId: string,
  forbiddenMessage = "Forbidden",
): Promise<Note> {
  const note = await findActiveNoteById(db, noteId);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (note.ownerId !== userId) {
    throw new HTTPException(403, { message: forbiddenMessage });
  }
  return note;
}

/**
 * Requires `userId` to have admin role (`users.role === 'admin'`).
 * Used when creating a note with `is_official: true` or changing `is_official` on update.
 *
 * `userId` が admin（`users.role === 'admin'`）であることを検証する。
 * ノート作成で `is_official: true` とする場合、または更新で `is_official` を変更する場合に使う。
 *
 * @throws HTTPException 403 when the user is not an admin
 */
export async function requireAdminUser(db: Database, userId: string): Promise<void> {
  const row = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row[0]?.role !== "admin") {
    throw new HTTPException(403, { message: "Only admins can set is_official" });
  }
}

/**
 * Active (non-deleted) page counts per note id.
 * ノート ID ごとのアクティブ（未削除）ページ数を返す。
 */
export async function getActivePageCounts(
  db: Database,
  noteIds: string[],
): Promise<Map<string, number>> {
  if (noteIds.length === 0) return new Map();
  const counts = await db
    .select({
      noteId: pages.noteId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(pages)
    .where(and(inArray(pages.noteId, noteIds), eq(pages.isDeleted, false)))
    .groupBy(pages.noteId);
  return new Map(counts.map((c) => [c.noteId, c.count]));
}

/**
 * Active member counts per note id (non-deleted memberships).
 * ノート ID ごとのアクティブメンバー数（未削除のメンバーシップ）を返す。
 */
export async function getActiveMemberCounts(
  db: Database,
  noteIds: string[],
): Promise<Map<string, number>> {
  if (noteIds.length === 0) return new Map();
  const counts = await db
    .select({
      noteId: noteMembers.noteId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(noteMembers)
    .where(
      and(
        inArray(noteMembers.noteId, noteIds),
        eq(noteMembers.isDeleted, false),
        eq(noteMembers.status, "accepted"),
      ),
    )
    .groupBy(noteMembers.noteId);
  return new Map(counts.map((c) => [c.noteId, c.count]));
}

// ── Role & Permission ───────────────────────────────────────────────────────

/**
 * Resolves the caller's role for a note (owner, member, guest, or none).
 * 呼び出し元のノートに対するロール（owner / メンバー / guest / なし）を解決する。
 *
 * 解決順は以下で固定する (#663):
 * 1. owner          (`notes.owner_id`)
 * 2. member         (`note_members` with `status='accepted'`)
 * 3. domain access  (`note_domain_access` where domain = userEmail の `@` 以降)
 * 4. visibility     (`public` / `unlisted` → `guest`)
 * 5. none
 *
 * Resolution order (#663):
 * 1. owner         (`notes.owner_id`)
 * 2. member        (`note_members` where `status='accepted'`)
 * 3. domain access (`note_domain_access` matching the caller's email domain)
 * 4. visibility    (`public` / `unlisted` → `guest`)
 * 5. none
 *
 * ドメイン経由のアクセスは `note_members` を作らない（"在籍" ではなく
 * "ルール" として扱う）。そのため `GET /notes/:noteId/members` には出ず、
 * ドメイン削除は即座にアクセスを失効させる（キャッシュなし）。
 *
 * Domain rules do not spawn `note_members` rows — they are pure rules, so
 * listing members never surfaces domain callers, and deleting a domain rule
 * immediately cuts off anyone who was relying on it.
 */
export async function getNoteRole(
  noteId: string,
  userId: string | undefined,
  userEmail: string | undefined,
  db: Database,
): Promise<{ role: NoteRole; note: Note | null }> {
  const note = await findActiveNoteById(db, noteId);
  if (!note) return { role: null, note: null };

  if (userId && note.ownerId === userId) return { role: "owner", note };

  const normalizedEmail = typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";

  if (normalizedEmail.length > 0) {
    // メンバーは大文字小文字を区別せずに突合する。schema 側では lower-case で
    // 保存する運用だが、古い行や手動挿入の取りこぼしを避けるため `LOWER(...)`
    // で比較する。ヒットした場合はドメインルールより強い（= メンバー昇格済み）。
    //
    // Match members case-insensitively. Rows should already be lower-cased by
    // `members.ts`, but compare via `LOWER(...)` to cover legacy / manual data.
    // A member match outranks any domain rule (they were explicitly upgraded).
    const member = await db
      .select({ role: noteMembers.role })
      .from(noteMembers)
      .where(
        and(
          eq(noteMembers.noteId, noteId),
          sql`LOWER(${noteMembers.memberEmail}) = ${normalizedEmail}`,
          eq(noteMembers.isDeleted, false),
          eq(noteMembers.status, "accepted"),
        ),
      )
      .limit(1);

    const firstMember = member[0];
    if (firstMember) {
      return { role: firstMember.role as NoteMemberRole, note };
    }

    // ドメイン招待ルール: `user@EXAMPLE.com` のドメイン部 `example.com` で一致
    // した最強ロールを返す（editor > viewer）。該当ルール削除は即反映するため
    // キャッシュせず DB を都度引く。
    //
    // Domain rule: pick the strongest role (editor beats viewer) among active
    // rules matching the caller's email domain. We always query live so that
    // revoking a rule takes effect immediately.
    const domain = extractEmailDomain(normalizedEmail);
    if (domain) {
      const rules = await db
        .select({ role: noteDomainAccess.role })
        .from(noteDomainAccess)
        .where(
          and(
            eq(noteDomainAccess.noteId, noteId),
            eq(noteDomainAccess.domain, domain),
            eq(noteDomainAccess.isDeleted, false),
          ),
        );

      if (rules.length > 0) {
        const hasEditor = rules.some((r) => r.role === "editor");
        return { role: hasEditor ? "editor" : "viewer", note };
      }
    }
  }

  if (note.visibility === "public" || note.visibility === "unlisted") {
    return { role: "guest", note };
  }

  return { role: null, note };
}

/**
 * Whether the role may edit the note given visibility and edit_permission.
 * visibility / edit_permission に基づき、そのロールがノートを編集できるか。
 *
 * **Security / UX note:** When `edit_permission === 'any_logged_in'` and
 * `visibility` is `public` or `unlisted`, every authenticated user in the app
 * can edit pages in this note (guest role gains edit). The UI warns before
 * saving `public` or `unlisted` with `any_logged_in`; callers should document this for operators.
 *
 * **セキュリティ・UX:** `edit_permission` が `any_logged_in` かつ `visibility` が
 * `public` または `unlisted` のとき、当該ノートはアプリ内の全認証済みユーザーが
 * ページ編集可能（guest でも編集可）。UI はその組み合わせへの初回保存前に確認する。
 * 運用向けに本挙動を文書化すること。
 */
export function canEdit(role: NoteRole, note: Note): boolean {
  if (role === "owner") return true;
  if (role === "editor" && note.editPermission !== "owner_only") return true;
  if (
    role === "guest" &&
    note.editPermission === "any_logged_in" &&
    (note.visibility === "public" || note.visibility === "unlisted")
  ) {
    return true;
  }
  return false;
}
