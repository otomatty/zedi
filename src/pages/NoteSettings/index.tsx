import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Button, useToast } from "@zedi/ui";
import { useDeleteNote, useNote } from "@/hooks/useNoteQueries";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { useTranslation } from "react-i18next";
import { NoteSettingsShareSection } from "./NoteSettingsShareSection";
import { NoteSettingsVisibilitySection } from "./NoteSettingsVisibilitySection";
import { NoteSettingsDeleteSection } from "./NoteSettingsDeleteSection";
import { PublicAnyLoggedInSaveAlertDialog } from "./PublicAnyLoggedInSaveAlertDialog";
import { useNoteSettingsSaveWithPublicConfirm } from "./useNoteSettingsSaveWithPublicConfirm";

/**
 * Note settings page: share link, visibility, delete; save confirms public + any_logged_in once.
 * ノート設定ページ（共有リンク・公開範囲・削除）。公開 + any_logged_in への初回保存時に確認する。
 */
const NoteSettings: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const canManage = Boolean(access?.canManageMembers && source === "local");
  const deleteNoteMutation = useDeleteNote();

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [editPermission, setEditPermission] = useState<NoteEditPermission>("owner_only");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    handleSaveNote,
    confirmOpen: isPublicAnyLoggedInSaveConfirmOpen,
    setConfirmOpen: setIsPublicAnyLoggedInSaveConfirmOpen,
    handleConfirmPublicAnyLoggedInSave,
    isSaving,
  } = useNoteSettingsSaveWithPublicConfirm({
    noteId,
    note: note ?? undefined,
    title,
    visibility,
    editPermission,
  });

  useEffect(() => {
    if (!note) return;
    // Sync local form state from the loaded note. Setters are called directly
    // (no `queueMicrotask`) so a deferred callback cannot fire after `note`
    // becomes null — that previously caused unhandled microtask exceptions
    // surfaced as Stryker `# errors`, plus React `act()` warnings in tests.
    // ロード済みノートからローカル状態を同期。`queueMicrotask` で遅延すると、
    // `note` が null/入れ替わった後にコールバックが走って例外となり、
    // mutation testing の RuntimeError や `act()` 警告の原因になっていた。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from loaded note
    setTitle(note.title);
    setVisibility(note.visibility);
    setEditPermission(note.editPermission);
  }, [note]);

  const noteUrl = useMemo(() => {
    if (!noteId) return "";
    return `${window.location.origin}/notes/${noteId}`;
  }, [noteId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(noteUrl);
      toast({ title: t("notes.linkCopied") });
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast({ title: t("notes.linkCopyFailed"), variant: "destructive" });
    }
  };

  const handleDeleteNote = async () => {
    if (!noteId) return;
    try {
      await deleteNoteMutation.mutateAsync(noteId);
      toast({ title: t("notes.noteDeleted") });
      setIsDeleteDialogOpen(false);
      navigate("/home");
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast({ title: t("notes.noteDeleteFailed"), variant: "destructive" });
    }
  };

  if (isNoteLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }

  if (!note || !access?.canView) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </PageLoadingOrDenied>
    );
  }

  return (
    <div className="min-h-0 flex-1 py-8">
      <Container>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{t("notes.noteSettings")}</h1>
              <NoteVisibilityBadge visibility={visibility} />
            </div>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {note.title || t("notes.untitledNote")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/notes/${note.id}`}>{t("notes.backToNote")}</Link>
          </Button>
        </div>

        {!canManage ? (
          <p className="text-muted-foreground mt-6 text-sm">{t("notes.noPermissionToEdit")}</p>
        ) : (
          <>
            <NoteSettingsShareSection noteUrl={noteUrl} onCopyLink={handleCopyLink} />
            <NoteSettingsVisibilitySection
              title={title}
              setTitle={setTitle}
              visibility={visibility}
              setVisibility={setVisibility}
              editPermission={editPermission}
              setEditPermission={setEditPermission}
              onSaveNote={handleSaveNote}
              isSaving={isSaving}
            />
            <NoteSettingsDeleteSection
              isDeleteDialogOpen={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
              onConfirmDelete={handleDeleteNote}
              isDeleting={deleteNoteMutation.isPending}
              noteTitle={note.title || t("notes.untitledNote")}
            />

            <PublicAnyLoggedInSaveAlertDialog
              open={isPublicAnyLoggedInSaveConfirmOpen}
              onOpenChange={setIsPublicAnyLoggedInSaveConfirmOpen}
              onConfirm={handleConfirmPublicAnyLoggedInSave}
              isSaving={isSaving}
            />
          </>
        )}
      </Container>
    </div>
  );
};

export default NoteSettings;
