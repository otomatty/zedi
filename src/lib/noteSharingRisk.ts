import type { NoteEditPermission, NoteVisibility } from "@/types/note";

/**
 * True when visibility is public and any authenticated user may edit.
 * 公開かつ、ログイン済みユーザー全員が編集可能な組み合わせか。
 */
export function isPublicAnyLoggedInCombo(
  visibility: NoteVisibility,
  editPermission: NoteEditPermission,
): boolean {
  return visibility === "public" && editPermission === "any_logged_in";
}

/**
 * Whether to show a confirmation before persisting: first transition into
 * `public` + `any_logged_in` (not already stored that way).
 *
 * 保存前に確認を出すか: いまの設定が「公開 + ログイン誰でも編集」へ**初めて**変わる場合。
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
