import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, useToast } from "@zedi/ui";
import { useAddPageToNote, useCopyPersonalPageToNote } from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { NoteViewAddPageDialogContent } from "./NoteViewAddPageDialogContent";
import type { PageSummary } from "@/types/page";

/**
 * Props for the controlled add-page dialog.
 * ページ追加ダイアログ（親で開閉制御）の Props。
 */
export interface NoteAddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  notePages: PageSummary[];
  canEdit: boolean;
}

/**
 * Self-contained add-page dialog used by the FAB on the note detail page.
 * Owns the local filter/title state and wraps the add-page mutation so the
 * parent only supplies note data and open/close control.
 *
 * ノート詳細 FAB から呼び出される「ページを追加」ダイアログ。
 * 検索フィルタ／新規タイトル状態とミューテーションを内部で完結させ、親は
 * ノート情報と開閉制御のみを渡す。
 */
export function NoteAddPageDialog({
  open,
  onOpenChange,
  noteId,
  notePages,
  canEdit,
}: NoteAddPageDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const addPageMutation = useAddPageToNote();
  const copyPersonalMutation = useCopyPersonalPageToNote();
  const { data: allPages = [] } = usePagesSummary();

  const [pageFilter, setPageFilter] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");

  const notePageIds = useMemo(() => new Set(notePages.map((p) => p.id)), [notePages]);
  const availablePages = useMemo(
    () => allPages.filter((p) => !notePageIds.has(p.id)),
    [allPages, notePageIds],
  );
  const filteredPages = useMemo(() => {
    const query = pageFilter.trim().toLowerCase();
    if (!query) return availablePages;
    return availablePages.filter((p) => (p.title || "").toLowerCase().includes(query));
  }, [availablePages, pageFilter]);

  const runAddPage = async (params: { pageId: string } | { title: string }) => {
    try {
      await addPageMutation.mutateAsync({ noteId, ...params });
      toast({ title: t("notes.pageAdded") });
      setNewPageTitle("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: t("notes.pageAddFailed"), variant: "destructive" });
    }
  };

  const handleAddByPageId = (pageId: string) => runAddPage({ pageId });

  const handleAddByTitle = async () => {
    const title = newPageTitle.trim();
    if (!title) return;
    await runAddPage({ title });
  };

  /**
   * 個人ページをコピーしてノートネイティブページを新規作成する (issue #713 Phase 3)。
   * 元ページは個人 /home に残り、コピーのみがノートに出る。
   *
   * Copy a personal page into the note as a fresh note-native page; the
   * original stays on `/home` and only the copy surfaces inside the note.
   */
  const handleCopyByPageId = async (sourcePageId: string) => {
    try {
      await copyPersonalMutation.mutateAsync({ noteId, sourcePageId });
      toast({ title: t("notes.pageCopiedToNote") });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to copy personal page to note:", error);
      toast({ title: t("notes.pageCopyToNoteFailed"), variant: "destructive" });
    }
  };

  const isPending = addPageMutation.isPending || copyPersonalMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NoteViewAddPageDialogContent
          newPageTitle={newPageTitle}
          setNewPageTitle={setNewPageTitle}
          pageFilter={pageFilter}
          setPageFilter={setPageFilter}
          filteredPages={filteredPages}
          canEdit={canEdit}
          onAddByTitle={handleAddByTitle}
          onAddByPageId={handleAddByPageId}
          onCopyByPageId={handleCopyByPageId}
          isPending={isPending}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
