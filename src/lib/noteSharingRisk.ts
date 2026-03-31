import type { NoteEditPermission, NoteVisibility } from "@/types/note";

/**
 * True when visibility is public or unlisted and any authenticated user may edit
 * (`any_logged_in`). Matches the high-risk combo from issue #432.
 * 公開または限定公開(URL)で、ログイン済みユーザー全員が編集可能な組み合わせか（#432 の高リスク組み合わせ）。
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
