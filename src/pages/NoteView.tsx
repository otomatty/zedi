import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { NotePageCard } from "@/components/note/NotePageCard";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useAddPageToNote,
  useNote,
  useNotePages,
  useRemovePageFromNote,
} from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";

const NoteView: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const { toast } = useToast();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const noteSource = source === "remote" ? "remote" : "local";
  const canManage = Boolean(access?.canEdit && noteSource === "local");
  const canManageMembers = Boolean(access?.canManageMembers && noteSource === "local");

  const { data: notePages = [], isLoading: isPagesLoading } = useNotePages(
    noteId ?? "",
    noteSource,
    Boolean(access?.canView)
  );

  const { data: allPages = [] } = usePagesSummary();

  const addPageMutation = useAddPageToNote();
  const removePageMutation = useRemovePageFromNote();

  const [isAddPageOpen, setIsAddPageOpen] = useState(false);
  const [pageFilter, setPageFilter] = useState("");

  const notePageIds = useMemo(
    () => new Set(notePages.map((page) => page.id)),
    [notePages]
  );

  const availablePages = useMemo(() => {
    return allPages.filter((page) => !notePageIds.has(page.id));
  }, [allPages, notePageIds]);

  const filteredPages = useMemo(() => {
    const query = pageFilter.trim().toLowerCase();
    if (!query) return availablePages;
    return availablePages.filter((page) =>
      (page.title || "").toLowerCase().includes(query)
    );
  }, [availablePages, pageFilter]);


  const handleAddPage = async (pageId: string) => {
    if (!noteId) return;
    try {
      await addPageMutation.mutateAsync({ noteId, pageId });
      toast({ title: "ページを追加しました" });
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: "ページの追加に失敗しました", variant: "destructive" });
    }
  };

  const handleRemovePage = async (pageId: string) => {
    if (!noteId) return;
    try {
      await removePageMutation.mutateAsync({ noteId, pageId });
      toast({ title: "ページを削除しました" });
    } catch (error) {
      console.error("Failed to remove page:", error);
      toast({ title: "ページの削除に失敗しました", variant: "destructive" });
    }
  };


  if (isNoteLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">読み込み中...</p>
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
            <p className="text-sm text-muted-foreground">
              ノートが見つからないか、閲覧権限がありません。
            </p>
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
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold truncate">
                  {note.title || "無題のノート"}
                </h1>
                <NoteVisibilityBadge visibility={note.visibility} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {notePages.length} 件のページ
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManageMembers && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/note/${note.id}/members`}>メンバー</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/note/${note.id}/settings`}>設定</Link>
                  </Button>
                </>
              )}
              {canManage && (
                <Dialog open={isAddPageOpen} onOpenChange={setIsAddPageOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      ページを追加
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>ページを追加</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input
                        value={pageFilter}
                        onChange={(event) => setPageFilter(event.target.value)}
                        placeholder="タイトルで検索"
                      />
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {filteredPages.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            追加できるページがありません。
                          </p>
                        ) : (
                          filteredPages.map((page) => (
                            <button
                              key={page.id}
                              onClick={() => handleAddPage(page.id)}
                              className="w-full rounded-md border border-border/50 px-3 py-2 text-left text-sm hover:border-border"
                            >
                              {page.title || "無題のページ"}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddPageOpen(false)}
                      >
                        閉じる
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          <div className="mt-4">
            {isPagesLoading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : notePages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだページが登録されていません。
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {notePages.map((page) => (
                  <div key={page.id} className="relative">
                    <NotePageCard noteId={note.id} page={page} />
                    {canManage && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
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
