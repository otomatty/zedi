import type { PageSummary } from "@/types/page";

/**
 *
 */
export type NotePageSummary = PageSummary & { addedByUserId?: string | null };

/**
 * Derives permission flags for the note view from access and note source.
 * アクセス権とノートソースからノートビュー用の権限フラグを算出する。
 */
export function getNoteViewPermissions(
  access:
    | {
        canEdit?: boolean;
        canAddPage?: boolean;
        canManageMembers?: boolean;
      }
    | undefined,
  noteSource: string,
) {
  const canEdit = Boolean(access?.canEdit && noteSource === "local");
  const canAddPage = Boolean(access?.canAddPage);
  const canShowAddPage = canEdit || canAddPage;
  const canManageMembers = Boolean(access?.canManageMembers && noteSource === "local");
  return { canEdit, canAddPage, canShowAddPage, canManageMembers };
}
