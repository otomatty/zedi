import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Badge, useToast } from "@zedi/ui";
import {
  useAddPageToNote,
  useNote,
  useNoteApi,
  useNotePages,
  useRemovePageFromNote,
} from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { useTranslation } from "react-i18next";
import { getNoteViewPermissions } from "./noteViewHelpers";
import { NoteViewLoadingOrDenied } from "./NoteViewLoadingOrDenied";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import { NoteViewMainContent } from "./NoteViewMainContent";

/**
 * Note detail page: pages grid, add/remove, header actions.
 * ノート詳細（ページ一覧・追加・削除・ヘッダーアクション）。
 */
const NoteView: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const { toast } = useToast();

  const { isSignedIn } = useNoteApi();
  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const noteSource = source === "remote" ? "remote" : "local";
  const { canEdit, canShowAddPage, canManageMembers } = getNoteViewPermissions(access, noteSource);
  const isLoading = isNoteLoading;
  const isNotFound = !note || !access?.canView;

  const canDeletePage = useCallback(
    (addedByUserId: string | null | undefined) => {
      if (addedByUserId == null || addedByUserId === "") return false;
      const fn = access?.canDeletePage;
      if (!fn) return false;
      return fn(addedByUserId);
    },
    [access],
  );

  const { data: notePages = [], isLoading: isPagesLoading } = useNotePages(
    noteId ?? "",
    noteSource,
    Boolean(access?.canView),
  );

  const { data: allPages = [] } = usePagesSummary();

  const addPageMutation = useAddPageToNote();
  const removePageMutation = useRemovePageFromNote();

  const [isAddPageOpen, setIsAddPageOpen] = useState(false);
  const [pageFilter, setPageFilter] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");

  const notePageIds = useMemo(() => new Set(notePages.map((page) => page.id)), [notePages]);

  const availablePages = useMemo(() => {
    return allPages.filter((page) => !notePageIds.has(page.id));
  }, [allPages, notePageIds]);

  const filteredPages = useMemo(() => {
    const query = pageFilter.trim().toLowerCase();
    if (!query) return availablePages;
    return availablePages.filter((page) => (page.title || "").toLowerCase().includes(query));
  }, [availablePages, pageFilter]);

  const handleAddPage = async (pageId: string) => {
    if (!noteId) return;
    try {
      await addPageMutation.mutateAsync({ noteId, pageId });
      toast({ title: t("notes.pageAdded") });
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: t("notes.pageAddFailed"), variant: "destructive" });
    }
  };

  const handleRemovePage = async (pageId: string) => {
    if (!noteId) return;
    try {
      await removePageMutation.mutateAsync({ noteId, pageId });
      toast({ title: t("notes.pageRemoved") });
    } catch (error) {
      console.error("Failed to remove page:", error);
      toast({ title: t("notes.pageRemoveFailed"), variant: "destructive" });
    }
  };

  const handleAddNewPageByTitle = async () => {
    if (!noteId || !newPageTitle.trim()) return;
    try {
      await addPageMutation.mutateAsync({ noteId, title: newPageTitle.trim() });
      toast({ title: t("notes.pageAdded") });
      setNewPageTitle("");
      setIsAddPageOpen(false);
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: t("notes.pageAddFailed"), variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <NoteViewLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </NoteViewLoadingOrDenied>
    );
  }
  if (isNotFound) {
    return (
      <NoteViewLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </NoteViewLoadingOrDenied>
    );
  }

  return (
    <ContentWithAIChat
      floatingAction={
        canEdit ? (
          <div className="mr-4 mb-4">
            <FloatingActionButton />
          </div>
        ) : null
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto py-6">
        <Container>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">
                  {note.title || t("notes.untitledNote")}
                </h1>
                <NoteVisibilityBadge visibility={note.visibility} />
                {note.isOfficial && <Badge variant="secondary">{t("notes.officialBadge")}</Badge>}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("notes.pagesCount", { count: notePages.length })}
              </p>
            </div>
            <NoteViewHeaderActions
              note={note}
              canManageMembers={canManageMembers}
              isSignedIn={isSignedIn}
              canView={Boolean(access?.canView)}
              canShowAddPage={canShowAddPage}
              isAddPageOpen={isAddPageOpen}
              setIsAddPageOpen={setIsAddPageOpen}
              newPageTitle={newPageTitle}
              setNewPageTitle={setNewPageTitle}
              pageFilter={pageFilter}
              setPageFilter={setPageFilter}
              filteredPages={filteredPages}
              canEdit={canEdit}
              onAddByTitle={handleAddNewPageByTitle}
              onAddByPageId={handleAddPage}
              addPagePending={addPageMutation.isPending}
            />
          </div>
          <NoteViewMainContent
            noteId={note.id}
            notePages={notePages}
            isPagesLoading={isPagesLoading}
            canDeletePage={canDeletePage}
            onRemovePage={handleRemovePage}
          />
        </Container>
      </main>
    </ContentWithAIChat>
  );
};

export default NoteView;
