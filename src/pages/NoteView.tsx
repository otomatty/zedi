import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { NotePageCard } from "@/components/note/NotePageCard";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
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
import { useToast } from "@/hooks/use-toast";
import {
  useAddPageToNote,
  useNote,
  useNotePages,
  useRemovePageFromNote,
} from "@/hooks/useNoteQueries";
import { useNoteApi } from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

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
  const canEdit = Boolean(access?.canEdit && noteSource === "local");
  const canAddPage = Boolean(access?.canAddPage);
  const canShowAddPage = canEdit || canAddPage;
  const canManageMembers = Boolean(access?.canManageMembers && noteSource === "local");

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
      <main className="py-6">
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
              <p className="mt-1 text-sm text-muted-foreground">
                {t("notes.pagesCount", { count: notePages.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManageMembers && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/note/${note.id}/members`}>{t("notes.members")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/note/${note.id}/settings`}>{t("notes.settings")}</Link>
                  </Button>
                </>
              )}
              {!isSignedIn && access?.canView && (
                <span className="text-sm text-muted-foreground">{t("notes.loginToPost")}</span>
              )}
              {canShowAddPage && (
                <Dialog open={isAddPageOpen} onOpenChange={setIsAddPageOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      {t("notes.addPage")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("notes.addPageDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t("notes.addNewPageToNote")}</label>
                        <div className="flex gap-2">
                          <Input
                            value={newPageTitle}
                            onChange={(e) => setNewPageTitle(e.target.value)}
                            placeholder={t("notes.newPageTitle")}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleAddNewPageByTitle}
                            disabled={!newPageTitle.trim() || addPageMutation.isPending}
                          >
                            {t("notes.add")}
                          </Button>
                        </div>
                      </div>
                      {canEdit && (
                        <>
                          <div className="space-y-2 border-t pt-3">
                            <label className="text-sm font-medium">
                              {t("notes.searchByTitle")}
                            </label>
                            <Input
                              value={pageFilter}
                              onChange={(event) => setPageFilter(event.target.value)}
                              placeholder={t("notes.searchByTitle")}
                            />
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                              {filteredPages.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  {t("notes.noPagesToAdd")}
                                </p>
                              ) : (
                                filteredPages.map((page) => (
                                  <button
                                    key={page.id}
                                    onClick={() => handleAddPage(page.id)}
                                    className="w-full rounded-md border border-border/50 px-3 py-2 text-left text-sm hover:border-border"
                                  >
                                    {page.title || t("notes.untitledPage")}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddPageOpen(false)}>
                        {t("notes.close")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="mt-4">
            {isPagesLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : notePages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("notes.noPagesYet")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {notePages.map((page) => (
                  <div key={page.id} className="relative">
                    <NotePageCard noteId={note.id} page={page} />
                    {access?.canDeletePage(page.addedByUserId) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-2 h-7 w-7"
                        onClick={() => handleRemovePage(page.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
};

export default NoteView;
