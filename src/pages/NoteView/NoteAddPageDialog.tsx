import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, useToast } from "@zedi/ui";
import { useAddPageToNote } from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { NoteViewAddPageDialogContent } from "./NoteViewAddPageDialogContent";
import type { NotePageSummary } from "./noteViewHelpers";

/**
 * Props for the controlled add-page dialog.
 * ページ追加ダイアログ（親で開閉制御）の Props。
 */
export interface NoteAddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  notePages: NotePageSummary[];
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

  const handleAddByPageId = async (pageId: string) => {
    try {
      await addPageMutation.mutateAsync({ noteId, pageId });
      toast({ title: t("notes.pageAdded") });
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: t("notes.pageAddFailed"), variant: "destructive" });
    }
  };

  const handleAddByTitle = async () => {
    const title = newPageTitle.trim();
    if (!title) return;
    try {
      await addPageMutation.mutateAsync({ noteId, title });
      toast({ title: t("notes.pageAdded") });
      setNewPageTitle("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add page:", error);
      toast({ title: t("notes.pageAddFailed"), variant: "destructive" });
    }
  };

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
          isPending={addPageMutation.isPending}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
