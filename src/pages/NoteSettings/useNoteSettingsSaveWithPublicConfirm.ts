import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useUpdateNote } from "@/hooks/useNoteQueries";
import type { Note, NoteEditPermission, NoteVisibility } from "@/types/note";
import {
  shouldConfirmDefaultNotePublicSave,
  shouldConfirmPublicAnyLoggedInSave,
} from "@/lib/noteSharingRisk";

type UseNoteSettingsSaveWithPublicConfirmArgs = {
  noteId: string | undefined;
  note: Note | null | undefined;
  title: string;
  visibility: NoteVisibility;
  editPermission: NoteEditPermission;
};

/**
 * Save handler that may stage up to two warning dialogs in sequence:
 *   1. The default-note exposure warning (issue #830) when a user flips their
 *      `is_default` note from a non-shareable visibility to `public` / `unlisted`.
 *   2. The existing `public` / `unlisted` + `any_logged_in` open-collaboration
 *      warning when the resulting combo first becomes broadly editable.
 *
 * If both apply, the default-note dialog is shown first; confirming that one
 * leads into the open-collaboration dialog before the actual save runs. This
 * matches "案 A" (two-step dialogs) from the issue's implementation notes.
 *
 * 保存ハンドラ。状況に応じて最大 2 段の警告ダイアログを直列に表示する:
 *   1. 既定ノートを `public` / `unlisted` に切り替える際の公開警告（#830）。
 *   2. 既存の「公開/限定公開 + ログイン誰でも編集」警告。
 * 両条件に該当するときは、まず既定ノート警告 → 確定後に協業警告 → 保存。
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
  const [defaultNoteWarningOpen, setDefaultNoteWarningOpen] = useState(false);

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

  const proceedAfterDefaultNoteWarning = useCallback(
    (currentNote: Note) => {
      if (
        shouldConfirmPublicAnyLoggedInSave(
          visibility,
          editPermission,
          currentNote.visibility,
          currentNote.editPermission,
        )
      ) {
        setConfirmOpen(true);
        return;
      }
      void performSaveNote();
    },
    [visibility, editPermission, performSaveNote],
  );

  const handleSaveNote = useCallback(() => {
    if (!noteId || !note) return;
    if (!title.trim()) {
      toast({
        title: t("notes.titleRequired"),
        variant: "destructive",
      });
      return;
    }
    if (shouldConfirmDefaultNotePublicSave(note.isDefault, visibility, note.visibility)) {
      setDefaultNoteWarningOpen(true);
      return;
    }
    proceedAfterDefaultNoteWarning(note);
  }, [noteId, note, title, visibility, proceedAfterDefaultNoteWarning, toast, t]);

  const handleConfirmDefaultNoteWarning = useCallback(() => {
    setDefaultNoteWarningOpen(false);
    if (!note) return;
    proceedAfterDefaultNoteWarning(note);
  }, [note, proceedAfterDefaultNoteWarning]);

  const handleConfirmPublicAnyLoggedInSave = useCallback(() => {
    setConfirmOpen(false);
    void performSaveNote();
  }, [performSaveNote]);

  return {
    handleSaveNote,
    confirmOpen,
    setConfirmOpen,
    handleConfirmPublicAnyLoggedInSave,
    defaultNoteWarningOpen,
    setDefaultNoteWarningOpen,
    handleConfirmDefaultNoteWarning,
    isSaving: updateNoteMutation.isPending,
  };
}
