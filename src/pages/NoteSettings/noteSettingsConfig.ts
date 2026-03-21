import type { NoteEditPermission, NoteVisibility } from "@/types/note";

/**
 * i18n keys for note visibility labels.
 * ノートの公開範囲ラベル用の i18n キー。
 */
export const visibilityKeys: Record<NoteVisibility, string> = {
  private: "notes.visibilityPrivate",
  public: "notes.visibilityPublic",
  unlisted: "notes.visibilityUnlisted",
  restricted: "notes.visibilityRestricted",
};

/**
 * i18n keys for who-can-edit policy labels.
 * 編集権限ポリシー表示用の i18n キー。
 */
export const editPermissionKeys: Record<NoteEditPermission, string> = {
  owner_only: "notes.editPermissionOwnerOnly",
  members_editors: "notes.editPermissionMembersEditors",
  any_logged_in: "notes.editPermissionAnyLoggedIn",
};

/**
 * Allowed edit permission options per visibility (UI disables invalid combos).
 * 公開範囲ごとに選択可能な編集権限の組み合わせ。
 */
export const allowedEditPermissions: Record<NoteVisibility, NoteEditPermission[]> = {
  private: ["owner_only"],
  restricted: ["owner_only", "members_editors"],
  unlisted: ["owner_only", "members_editors", "any_logged_in"],
  public: ["owner_only", "members_editors", "any_logged_in"],
};
