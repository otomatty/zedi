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
        canManageMembers?: boolean;
      }
    | undefined,
  noteSource: string,
): { canView: boolean; canEdit: boolean; canManageMembers: boolean } {
  const canView = Boolean(access?.canView);
  const canEdit = Boolean(access?.canEdit && noteSource === "local");
  const canManageMembers = Boolean(access?.canManageMembers && noteSource === "local");
  return { canView, canEdit, canManageMembers };
}
