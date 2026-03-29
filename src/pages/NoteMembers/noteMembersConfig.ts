import type { NoteMemberRole } from "@/types/note";

/**
 * i18n keys for member role labels (viewer / editor).
 * メンバーロール表示用の i18n キー。
 */
export const memberRoleKeys: Record<NoteMemberRole, string> = {
  viewer: "notes.roleViewer",
  editor: "notes.roleEditor",
};
