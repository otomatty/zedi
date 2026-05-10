import type { NoteEditPermission, NoteVisibility } from "@/types/note";

/**
 * True when visibility is public or unlisted and any authenticated user may edit
 * (`any_logged_in`). Same cases as the UI confirmation flow for open collaboration.
 * 公開または限定公開(URL)でログイン済みユーザー全員が編集可能な組み合わせ（UI 確認ダイアログの対象と一致）。
 */
export function isPublicAnyLoggedInCombo(
  visibility: NoteVisibility,
  editPermission: NoteEditPermission,
): boolean {
  return (
    (visibility === "public" || visibility === "unlisted") && editPermission === "any_logged_in"
  );
}

/**
 * Whether to show a confirmation before persisting: first transition into
 * `public` or `unlisted` + `any_logged_in` (not already stored that way).
 *
 * 保存前に確認を出すか: いまの設定が「公開または限定公開 + ログイン誰でも編集」へ**初めて**変わる場合。
 */
export function shouldConfirmPublicAnyLoggedInSave(
  visibility: NoteVisibility,
  editPermission: NoteEditPermission,
  previousVisibility: NoteVisibility,
  previousEditPermission: NoteEditPermission,
): boolean {
  if (!isPublicAnyLoggedInCombo(visibility, editPermission)) return false;
  return !isPublicAnyLoggedInCombo(previousVisibility, previousEditPermission);
}

/**
 * Whether the visibility value would expose the note beyond the owner. `public`
 * is fully indexable and `unlisted` is reachable by URL, so both leak personal
 * pages stored in a default note.
 *
 * 公開範囲がノート所有者以外に見える状態か。`public` は検索対象、`unlisted` も
 * URL を知る人なら閲覧可能なので、いずれも既定ノートの個人メモが流出しうる。
 */
export function isShareableVisibility(visibility: NoteVisibility): boolean {
  return visibility === "public" || visibility === "unlisted";
}

/**
 * Whether to surface the default-note public-exposure warning before saving:
 * the note is the caller's default ("マイノート") and visibility is moving from
 * a non-shareable value (e.g. `private` / `restricted`) to `public` or
 * `unlisted`. We only warn on the **transition** so re-saving an already-public
 * default note (e.g. just renaming) does not nag.
 *
 * 既定ノート（マイノート）の公開警告ダイアログを出すか:
 * 公開範囲が「非共有 → public/unlisted」へ**初めて**切り替わるときに限定する。
 * 既に公開済みの再保存（タイトル編集など）では出さない。
 */
export function shouldConfirmDefaultNotePublicSave(
  isDefault: boolean,
  visibility: NoteVisibility,
  previousVisibility: NoteVisibility,
): boolean {
  if (!isDefault) return false;
  if (!isShareableVisibility(visibility)) return false;
  return !isShareableVisibility(previousVisibility);
}
