/**
 * Hocuspocus WebSocket 認証から呼ばれるページ編集権限の純粋判定ロジック。
 *
 * Issue #823 でサーバ側のページモデルが「個人ページ (`note_id IS NULL`) + 共有
 * ノート (`note_pages` リンク)」から「すべてのページが `pages.note_id` でちょうど
 * 1 ノートに所属する」モデルへ移行し、`note_pages` は migration `0023` で
 * DROP された。Hocuspocus 側の旧 SQL は `note_pages` を JOIN したままだったため、
 * マイグレーション適用後の develop 環境で WebSocket 認証が PostgreSQL の
 * `relation "note_pages" does not exist` で失敗していた。本モジュールは
 * API 側 `routes/notes/helpers.ts` の `getNoteRole` / `canEdit` と同じ意味論を
 * 維持しながら、DB アクセスを呼び出し側に切り出して単体テスト可能にしたもの。
 *
 * Pure (DB-free) edit-permission decisions used by the Hocuspocus
 * `onAuthenticate` hook. Issue #823 retired the `note_pages` link table in
 * favour of `pages.note_id`; this module mirrors the API's
 * `getNoteRole` / `canEdit` precedence so that WebSocket auth and the REST
 * routes stay aligned. Keeping the logic DB-free makes the precedence
 * (owner → member → domain → guest → none) directly unit-testable.
 */

/**
 * `notes` テーブル由来のアクセス判定に必要な最小情報。
 * Minimal note state required for edit-permission decisions.
 */
export interface NoteAccessFacts {
  /** `notes.owner_id`. */
  ownerId: string;
  /** `notes.visibility`. */
  visibility: "private" | "public" | "unlisted" | "restricted";
  /** `notes.edit_permission`. */
  editPermission: "owner_only" | "members_editors" | "any_logged_in";
}

/**
 * 呼び出し元ユーザーの識別情報。`emailLower` は小文字化済みであることを前提と
 * する（`note_members` / `note_domain_access` 突合に使う）。
 *
 * Identity of the caller. `emailLower` must already be lower-cased so member
 * and domain lookups can use case-insensitive equality.
 */
export interface UserFacts {
  userId: string;
  emailLower: string;
}

/**
 * 呼び出し元の `note_members` 行（`status='accepted'`、`is_deleted=false` 前提）。
 * 該当行が無ければ `null`。
 *
 * Active accepted membership row, or `null` when absent.
 */
export type MemberFact = { role: "viewer" | "editor" } | null;

/**
 * 呼び出し元のメールドメインに一致した `note_domain_access` ルール群
 * （`is_deleted=false` 前提）。複数ルールがある場合は editor 優先で解決する。
 *
 * Domain access rules that match the caller's email domain. Multiple rules
 * resolve to `editor` if any rule grants editor.
 */
export interface DomainFacts {
  rules: ReadonlyArray<{ role: "viewer" | "editor" }>;
}

/**
 * 解決済みロール。`null` は「アクセス権なし」。
 * Resolved access role; `null` means no access at all.
 */
export type ResolvedRole = "owner" | "editor" | "viewer" | "guest" | null;

/**
 * API 側 `getNoteRole` と同じ優先順位でロールを解決する。
 *   owner → accepted member → domain rule → guest (public/unlisted) → null
 *
 * メンバー行が明示的に存在する場合はドメインルールより優先する（例: ドメイン
 * editor のチームに所属していても、本人だけ viewer として招待されている場合
 * は viewer 扱い）。
 *
 * Resolve the caller's role using the same precedence as the API's
 * `getNoteRole`. An explicit accepted membership row always wins over a
 * matching domain rule, even when the domain rule would grant a stronger
 * role — this mirrors the API contract so the WebSocket and REST sides agree.
 */
export function resolveNoteRole(
  note: NoteAccessFacts,
  user: UserFacts,
  member: MemberFact,
  domain: DomainFacts,
): ResolvedRole {
  if (note.ownerId === user.userId) return "owner";
  if (member) return member.role;
  if (domain.rules.length > 0) {
    const hasEditor = domain.rules.some((r) => r.role === "editor");
    return hasEditor ? "editor" : "viewer";
  }
  if (note.visibility === "public" || note.visibility === "unlisted") {
    return "guest";
  }
  return null;
}

/**
 * API 側 `canEdit(role, note)` と同じ意味論で編集可否を判定する。
 *
 * - owner: 常に編集可
 * - editor: `editPermission` が `owner_only` 以外で編集可
 * - guest: `visibility` が `public`/`unlisted` かつ `editPermission` が
 *   `any_logged_in` のときのみ編集可
 * - viewer / null: 編集不可
 *
 * Mirror of the API's `canEdit` helper:
 * - owner: always edits
 * - editor: edits unless `edit_permission = owner_only`
 * - guest: only on public/unlisted notes with `edit_permission = any_logged_in`
 * - viewer / null: never edits
 */
export function canEditFromRole(role: ResolvedRole, note: NoteAccessFacts): boolean {
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
