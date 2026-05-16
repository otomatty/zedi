/**
 * Re-export `NotePageSummary` from note queries (single source of truth).
 * `useNotePages` と同一の型をここからも参照できるようにする。
 */
export type { NotePageSummary } from "@/hooks/useNoteQueries";

/**
 * Derives permission flags for the note view from access and note source.
 * アクセス権とノートソースからノートビュー用の権限フラグを算出する。
 */
export function getNoteViewPermissions(
  access:
    | {
        canView?: boolean;
        canEdit?: boolean;
        canAddPage?: boolean;
        canManageMembers?: boolean;
      }
    | undefined,
  noteSource: string,
) {
  const canView = Boolean(access?.canView);
  const canEdit = Boolean(access?.canEdit && noteSource === "local");
  const canAddPage = Boolean(access?.canAddPage);
  const canShowAddPage = canEdit || canAddPage;
  const canManageMembers = Boolean(access?.canManageMembers && noteSource === "local");
  return { canView, canEdit, canAddPage, canShowAddPage, canManageMembers };
}
