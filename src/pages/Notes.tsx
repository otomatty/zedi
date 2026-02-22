import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { NotesLayout } from "@/components/note/NotesLayout";
import { useNotes, useCreateNote } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { NoteCard } from "@/components/note/NoteCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const Notes: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSignedIn } = useAuth();
  const { data: notes = [], isLoading } = useNotes();
  const createNoteMutation = useCreateNote();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [editPermission, setEditPermission] = useState<NoteEditPermission>("owner_only");

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: t("notes.titleRequired"),
        variant: "destructive",
      });
      return;
    }

    try {
      const newNote = await createNoteMutation.mutateAsync({
        title: title.trim(),
        visibility,
        editPermission,
      });
      setIsDialogOpen(false);
      setTitle("");
      setVisibility("private");
      setEditPermission("owner_only");
      navigate(`/note/${newNote.id}`);
    } catch (error) {
      console.error("Failed to create note:", error);
      toast({
        title: t("notes.createFailed"),
        variant: "destructive",
      });
    }
  };

  if (!isSignedIn) {
    return (
      <NotesLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h1 className="text-2xl font-semibold mb-4">{t("notes.title")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("notes.signInRequired", "ノートを利用するにはサインインが必要です")}
          </p>
          <Link to="/sign-in">
            <Button>{t("nav.signIn")}</Button>
          </Link>
        </div>
      </NotesLayout>
    );
  }

  return (
    <NotesLayout>
      {/* Page title & New note */}
      <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold">{t("notes.title")}</h1>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("notes.newNote")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("notes.newNoteDialogTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="note-title">{t("notes.noteTitle")}</Label>
                    <Input
                      id="note-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("notes.titlePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notes.visibility")}</Label>
                    <Select
                      value={visibility}
                      onValueChange={(v) => {
                        const next = v as NoteVisibility;
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
                <DialogFooter>
                  <Button
                    type="button"
                    onClick={handleCreate}
                    disabled={createNoteMutation.isPending}
                  >
                    {createNoteMutation.isPending ? t("notes.creating") : t("notes.create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* 参加しているノート */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-4">
              {t("notes.sectionParticipating")}
            </h2>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : sortedNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("notes.noNotesYet")}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedNotes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} />
                ))}
              </div>
            )}
          </section>
    </NotesLayout>
  );
};

export default Notes;
