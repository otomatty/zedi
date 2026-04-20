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
  /**
   * 空タイトル時に保存を拒否するかどうか。タイトル入力欄がない UI（共有モーダル）では `false` を渡す。
   * Whether to reject saves when `title` is blank. Callers that don't render a
   * title input (e.g. the share modal's visibility tab) should pass `false` so
   * notes with a legacy/empty title can still have their visibility changed.
   */
  validateTitle?: boolean;
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
  validateTitle = true,
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
    if (validateTitle && !title.trim()) {
      toast({
        title: t("notes.titleRequired"),
        variant: "destructive",
      });
      return;
    }
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
  }, [noteId, note, title, visibility, editPermission, validateTitle, performSaveNote, toast, t]);

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
