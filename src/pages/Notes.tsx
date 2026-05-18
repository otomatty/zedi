import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { NotesLayout } from "@/components/note/NotesLayout";
import { useNotes, useCreateNote } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { NoteCard } from "@/components/note/NoteCard";
import { NoteEditPermissionControls } from "@/components/note/NoteEditPermissionControls";
import { allowedEditPermissions, visibilityKeys } from "@/lib/noteSettingsConfig";
import { shouldConfirmPublicAnyLoggedInSave } from "@/lib/noteSharingRisk";
import { OpenPdfButton } from "@/components/pdf-reader/OpenPdfButton";
import { Button } from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * Watch for the `?new=1` deep-link emitted by `NoteTitleSwitcher`'s
 * "new note" footer item (originally issue #827; the header switcher has
 * been replaced by the title-as-switcher control on each note page). When
 * the param is present, fire `onOpen` (typically opens the create dialog)
 * and strip the param so a refresh does not reopen the dialog. Reacts to
 * URL transitions while `Notes` is already mounted, since the same
 * component persists across `/notes` ↔ `/notes?new=1` route updates.
 *
 * `?new=1` ディープリンクの監視（旧ヘッダー NoteSwitcher は廃止され、各
 * ノート画面のタイトル `NoteTitleSwitcher` が代替）。クエリが現れたら
 * `onOpen` を呼び出し（通常は作成ダイアログを開く）、リロード時に再オープン
 * しないようクエリを除去する。`Notes` がマウントされたまま
 * `/notes` ↔ `/notes?new=1` を遷移するケースにも対応する。
 */
export function useNewNoteDeepLink(onOpen: () => void): void {
  const location = useLocation();
  const navigate = useNavigate();
  // Latest-callback ref so the URL-watch effect can fire `onOpen` without
  // listing it in its dependency array — callers typically pass an inline
  // `() => setIsDialogOpen(true)`, which would otherwise re-trigger the
  // effect on every render of `Notes`.
  // 最新の onOpen を ref で保持し、URL 監視 effect の依存配列に含めない。
  // 呼び出し側がインライン関数（`() => setIsDialogOpen(true)` など）を
  // 渡す場合、毎レンダーで effect が再走するのを避けるため。
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") !== "1") return;
    onOpenRef.current();
    params.delete("new");
    navigate(
      { pathname: location.pathname, search: params.toString(), hash: location.hash },
      { replace: true },
    );
  }, [location.pathname, location.search, location.hash, navigate]);
}

interface CreateNoteDialogContentProps {
  title: string;
  setTitle: (v: string) => void;
  visibility: NoteVisibility;
  setVisibility: (v: NoteVisibility) => void;
  editPermission: NoteEditPermission;
  setEditPermission: (v: NoteEditPermission) => void;
  onCreate: () => Promise<void>;
  isPending: boolean;
}

function CreateNoteDialogContent({
  title,
  setTitle,
  visibility,
  setVisibility,
  editPermission,
  setEditPermission,
  onCreate,
  isPending,
}: CreateNoteDialogContentProps) {
  const { t } = useTranslation();
  return (
    <>
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
        <NoteEditPermissionControls
          visibility={visibility}
          editPermission={editPermission}
          setEditPermission={setEditPermission}
          selectId="new-note-edit-permission"
        />
      </div>
      <DialogFooter>
        <Button type="button" onClick={onCreate} disabled={isPending}>
          {isPending ? t("notes.creating") : t("notes.create")}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Signed-in notes list and new-note flow (with public + any_logged_in create confirmation).
 * サインイン済みユーザーのノート一覧と新規作成（公開協業確認付き）。
 */
const Notes: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSignedIn } = useAuth();
  const { data: notes = [], isLoading } = useNotes();
  const createNoteMutation = useCreateNote();
  /** After closing the public-collab confirm, reopen the create dialog if user cancelled. / 確認をキャンセルしたら作成ダイアログを再度開く */
  const reopenCreateAfterPublicConfirmRef = useRef(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  useNewNoteDeepLink(() => setIsDialogOpen(true));
  const [isPublicAnyLoggedInCreateConfirmOpen, setIsPublicAnyLoggedInCreateConfirmOpen] =
    useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [editPermission, setEditPermission] = useState<NoteEditPermission>("owner_only");

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);

  const executeCreate = async () => {
    reopenCreateAfterPublicConfirmRef.current = false;
    try {
      const newNote = await createNoteMutation.mutateAsync({
        title: title.trim(),
        visibility,
        editPermission,
      });
      setIsDialogOpen(false);
      setIsPublicAnyLoggedInCreateConfirmOpen(false);
      setTitle("");
      setVisibility("private");
      setEditPermission("owner_only");
      navigate(`/notes/${newNote.id}`);
    } catch (error) {
      console.error("Failed to create note:", error);
      setIsPublicAnyLoggedInCreateConfirmOpen(false);
      setIsDialogOpen(true);
      toast({
        title: t("notes.createFailed"),
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: t("notes.titleRequired"),
        variant: "destructive",
      });
      return;
    }

    if (shouldConfirmPublicAnyLoggedInSave(visibility, editPermission, "private", "owner_only")) {
      reopenCreateAfterPublicConfirmRef.current = true;
      setIsDialogOpen(false);
      setIsPublicAnyLoggedInCreateConfirmOpen(true);
      return;
    }

    await executeCreate();
  };

  const handleConfirmPublicAnyLoggedInCreate = () => {
    void executeCreate();
  };

  if (!isSignedIn) {
    return (
      <NotesLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h1 className="mb-4 text-2xl font-semibold">{t("notes.title")}</h1>
          <p className="text-muted-foreground mb-6">{t("notes.signInRequired")}</p>
          <Link to="/sign-in">
            <Button>{t("nav.signIn")}</Button>
          </Link>
        </div>
      </NotesLayout>
    );
  }

  return (
    <NotesLayout>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("notes.title")}</h1>
        <div className="flex items-center gap-2">
          {/* デスクトップ専用の PDF 取り込みエントリ。Web ビルドでは非表示。 */}
          {/* Desktop-only "Open PDF" entry. Hidden on the web build. */}
          <OpenPdfButton />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("notes.newNote")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateNoteDialogContent
                title={title}
                setTitle={setTitle}
                visibility={visibility}
                setVisibility={setVisibility}
                editPermission={editPermission}
                setEditPermission={setEditPermission}
                onCreate={handleCreate}
                isPending={createNoteMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <AlertDialog
        open={isPublicAnyLoggedInCreateConfirmOpen}
        onOpenChange={(next) => {
          if (!next && createNoteMutation.isPending) return;
          setIsPublicAnyLoggedInCreateConfirmOpen(next);
          if (!next && reopenCreateAfterPublicConfirmRef.current && !createNoteMutation.isPending) {
            reopenCreateAfterPublicConfirmRef.current = false;
            setIsDialogOpen(true);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.publicAnyLoggedInCreateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notes.publicAnyLoggedInCreateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createNoteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPublicAnyLoggedInCreate}
              disabled={createNoteMutation.isPending}
            >
              {createNoteMutation.isPending ? t("notes.creating") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="mb-10">
        <h2 className="text-foreground mb-4 text-lg font-medium">
          {t("notes.sectionParticipating")}
        </h2>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : sortedNotes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.noNotesYet")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
