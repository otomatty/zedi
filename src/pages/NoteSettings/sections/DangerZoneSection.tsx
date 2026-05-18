import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  useToast,
} from "@zedi/ui";
import { useDeleteNote } from "@/hooks/useNoteQueries";
import { useNoteSettingsContext } from "../NoteSettingsContext";

/**
 * `/notes/:noteId/settings/danger` — ノート削除（unrecoverable）セクション。
 *
 * owner のみアクセス可能。削除確認ダイアログでタイトルを再表示して人間の
 * 「うっかり削除」を抑止し、確定後は `/notes` 一覧へ戻す。
 *
 * Danger zone — owner-only note deletion. Confirms by echoing the note title
 * back to the user and returns to the notes index after the soft-delete
 * succeeds (the legacy behavior — clarified in PR #719's review).
 */
const DangerZoneSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { note, canManage } = useNoteSettingsContext();
  const deleteNoteMutation = useDeleteNote();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  if (!canManage) {
    return <p className="text-muted-foreground text-sm">{t("notes.noPermissionToEdit")}</p>;
  }

  const handleDeleteNote = async () => {
    try {
      await deleteNoteMutation.mutateAsync(note.id);
      toast({ title: t("notes.noteDeleted") });
      setIsDeleteDialogOpen(false);
      // ノート（コンテナ）削除後はノート一覧 (`/notes`) に戻す。個人ページ
      // 削除はホーム (`/home`) へ戻すが、対象が違うので遷移先も別（PR #719）。
      // Note deletes return to `/notes` (page deletes return to `/home`).
      navigate("/notes");
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast({ title: t("notes.noteDeleteFailed"), variant: "destructive" });
    }
  };

  const noteTitle = note.title || t("notes.untitledNote");

  return (
    <>
      <section className="border-destructive/40 space-y-3 rounded-lg border p-4">
        <header className="space-y-1">
          <h2 className="text-destructive text-base font-semibold">{t("notes.deleteSection")}</h2>
          <p className="text-muted-foreground text-sm">{t("notes.deleteSectionDescription")}</p>
        </header>
        <div className="flex justify-end">
          <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
            {t("notes.deleteNote")}
          </Button>
        </div>
      </section>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notes.deleteConfirmDescription", { title: noteTitle })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteNoteMutation.isPending}
            >
              {deleteNoteMutation.isPending ? t("notes.deleting") : t("notes.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DangerZoneSection;
