import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDeleteNote, useNote, useUpdateNote } from "@/hooks/useNoteQueries";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { useTranslation } from "react-i18next";

const visibilityKeys: Record<NoteVisibility, string> = {
  private: "notes.visibilityPrivate",
  public: "notes.visibilityPublic",
  unlisted: "notes.visibilityUnlisted",
  restricted: "notes.visibilityRestricted",
};

const editPermissionKeys: Record<NoteEditPermission, string> = {
  owner_only: "notes.editPermissionOwnerOnly",
  members_editors: "notes.editPermissionMembersEditors",
  any_logged_in: "notes.editPermissionAnyLoggedIn",
};

const allowedEditPermissions: Record<NoteVisibility, NoteEditPermission[]> = {
  private: ["owner_only"],
  restricted: ["owner_only", "members_editors"],
  unlisted: ["owner_only", "members_editors", "any_logged_in"],
  public: ["owner_only", "members_editors", "any_logged_in"],
};

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
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [editPermission, setEditPermission] = useState<NoteEditPermission>("owner_only");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (note) {
      queueMicrotask(() => {
        setTitle(note.title);
        setVisibility(note.visibility);
        setEditPermission(note.editPermission);
      });
    }
  }, [note]);

  const noteUrl = useMemo(() => {
    if (!noteId) return "";
    return `${window.location.origin}/note/${noteId}`;
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

  const handleSaveNote = async () => {
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
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </Container>
        </main>
      </div>
    );
  }

  if (!note || !access?.canView) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">{t("notes.noteNotFoundOrNoAccess")}</p>
          </Container>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-8">
        <Container>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{t("notes.noteSettings")}</h1>
                <NoteVisibilityBadge visibility={visibility} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {note.title || t("notes.untitledNote")}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/note/${note.id}`}>{t("notes.backToNote")}</Link>
            </Button>
          </div>

          {!canManage ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("notes.noPermissionToEdit")}</p>
          ) : (
            <>
              <section className="mt-6 rounded-lg border border-border/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("notes.shareLink")}</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input value={noteUrl} readOnly />
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t("notes.copy")}
                  </Button>
                </div>
              </section>

              <section className="mt-6 rounded-lg border border-border/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("notes.visibilitySettings")}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="note-title-input">{t("notes.noteTitle")}</Label>
                    <Input
                      id="note-title-input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t("notes.noteTitlePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notes.visibility")}</Label>
                    <Select
                      value={visibility}
                      onValueChange={(value) => {
                        const next = value as NoteVisibility;
                        setVisibility(next);
                        const allowed = allowedEditPermissions[next];
                        if (!allowed.includes(editPermission)) {
                          setEditPermission(allowed[0]);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("notes.selectVisibility")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(visibilityKeys) as NoteVisibility[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(visibilityKeys[value])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notes.editPermission")}</Label>
                    <Select
                      value={editPermission}
                      onValueChange={(v) => setEditPermission(v as NoteEditPermission)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedEditPermissions[visibility].map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(editPermissionKeys[value])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleSaveNote} disabled={updateNoteMutation.isPending}>
                    {updateNoteMutation.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </section>

              <section className="mt-6 rounded-lg border border-destructive/40 p-4">
                <h2 className="mb-3 text-sm font-semibold text-destructive">
                  {t("notes.deleteSection")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("notes.deleteSectionDescription")}
                </p>
                <div className="mt-4 flex justify-end">
                  <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                    {t("notes.deleteNote")}
                  </Button>
                </div>
              </section>
            </>
          )}
        </Container>
      </main>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notes.deleteConfirmDescription", {
                title: note.title || t("notes.untitledNote"),
              })}
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
    </div>
  );
};

export default NoteSettings;
