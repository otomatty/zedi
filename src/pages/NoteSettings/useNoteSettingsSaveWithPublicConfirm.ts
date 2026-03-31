import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useUpdateNote } from "@/hooks/useNoteQueries";
import type { Note, NoteEditPermission, NoteVisibility } from "@/types/note";
import { shouldConfirmPublicAnyLoggedInSave } from "@/lib/noteSharingRisk";

type UseNoteSettingsSaveWithPublicConfirmArgs = {
  noteId: string | undefined;
  note: Note | null | undefined;
  title: string;
  visibility: NoteVisibility;
  editPermission: NoteEditPermission;
};

/**
 * Save handler with optional confirm dialog when transitioning to public + any_logged_in.
 * 公開 + any_logged_in への初回変更時は確認ダイアログ経由で保存する。
 */
export function useNoteSettingsSaveWithPublicConfirm({
  noteId,
  note,
  title,
  visibility,
  editPermission,
}: UseNoteSettingsSaveWithPublicConfirmArgs) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const updateNoteMutation = useUpdateNote();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const performSaveNote = useCallback(async () => {
    if (!noteId) return;
    try {
      await updateNoteMutation.mutateAsync({
        noteId,
        updates: { title: title.trim(), visibility, editPermission },
      });
      toast({ title: t("notes.noteUpdated") });
    } catch (error) {
      console.error("Failed to update note:", error);
      toast({ title: t("notes.noteUpdateFailed"), variant: "destructive" });
    }
  }, [noteId, title, visibility, editPermission, updateNoteMutation, toast, t]);

  const handleSaveNote = useCallback(() => {
    if (!noteId || !note) return;
    if (
      shouldConfirmPublicAnyLoggedInSave(
        visibility,
        editPermission,
        note.visibility,
        note.editPermission,
      )
    ) {
      setConfirmOpen(true);
      return;
    }
    void performSaveNote();
  }, [noteId, note, visibility, editPermission, performSaveNote]);

  const handleConfirmPublicAnyLoggedInSave = useCallback(() => {
    setConfirmOpen(false);
    void performSaveNote();
  }, [performSaveNote]);

  return {
    handleSaveNote,
    confirmOpen,
    setConfirmOpen,
    handleConfirmPublicAnyLoggedInSave,
    isSaving: updateNoteMutation.isPending,
  };
}
