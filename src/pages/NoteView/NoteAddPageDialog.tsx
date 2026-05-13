import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, useToast } from "@zedi/ui";
import { useAddPageToNote, useCopyPersonalPageToNote } from "@/hooks/useNoteQueries";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { NoteViewAddPageDialogContent } from "./NoteViewAddPageDialogContent";

/**
 * Props for the controlled add-page dialog.
 * ページ追加ダイアログ（親で開閉制御）の Props。
 *
 * Issue #860 Phase 3 で `notePages: PageSummary[]` を除去した。旧コードは
 * `notePageIds` Set を作って `allPages` から除外していたが、issue #823 以降
 * ノートネイティブページは個人ページとは別 ID 体系で、一致は発生しないため
 * 実質 no-op になっていた。重複タイトル判定は将来的に note-scoped 検索 API
 * に寄せる方針で、ここでは全件配列の依存を断つ。
 *
 * Issue #860 Phase 3 dropped the `notePages` prop. The previous implementation
 * built a `notePageIds` Set and filtered personal pages by it, but since
 * issue #823 note-native pages live in a different id space from personal
 * pages so the filter never excluded anything. The duplicate-title check will
 * move to a note-scoped lookup API later; until then we just stop pulling in
 * the full note pages array.
 */
export interface NoteAddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
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
export function NoteAddPageDialog({ open, onOpenChange, noteId, canEdit }: NoteAddPageDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const addPageMutation = useAddPageToNote();
  const copyPersonalMutation = useCopyPersonalPageToNote();
  const { data: allPages = [] } = usePagesSummary();

  const [pageFilter, setPageFilter] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");

  const filteredPages = useMemo(() => {
    const query = pageFilter.trim().toLowerCase();
    if (!query) return allPages;
    return allPages.filter((p) => (p.title || "").toLowerCase().includes(query));
  }, [allPages, pageFilter]);

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
