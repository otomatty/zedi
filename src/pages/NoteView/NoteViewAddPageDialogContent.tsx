import { useId } from "react";
import { Button, DialogFooter, DialogHeader, DialogTitle, Input } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { PageSummary } from "@/types/page";

/**
 * Dialog body: add page by title and optional search list (when canEdit).
 * ページ追加ダイアログ（タイトル入力と、編集可時は検索リスト）。
 */
export interface NoteViewAddPageDialogContentProps {
  newPageTitle: string;
  setNewPageTitle: (v: string) => void;
  pageFilter: string;
  setPageFilter: (v: string) => void;
  filteredPages: PageSummary[];
  canEdit: boolean;
  onAddByTitle: () => Promise<void>;
  onAddByPageId: (pageId: string) => Promise<void>;
  /**
   * 個人ページをコピーしてノートネイティブページを新規作成する。元ページは
   * 個人 /home に残り、新しいコピーのみノートに出る (issue #713 Phase 3)。
   *
   * Copy a personal page into the note as a fresh note-native page; the source
   * stays on personal /home and only the copy surfaces inside the note.
   */
  onCopyByPageId: (pageId: string) => Promise<void>;
  isPending: boolean;
  onClose: () => void;
}

/**
 * Renders the add-page dialog body.
 * @param props - Dialog state, filtered pages list, and add/close handlers
 */
export function NoteViewAddPageDialogContent({
  newPageTitle,
  setNewPageTitle,
  pageFilter,
  setPageFilter,
  filteredPages,
  canEdit,
  onAddByTitle,
  onAddByPageId,
  onCopyByPageId,
  isPending,
  onClose,
}: NoteViewAddPageDialogContentProps) {
  const { t } = useTranslation();
  const newPageTitleFieldId = useId();
  const pageFilterFieldId = useId();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("notes.addPageDialogTitle")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={newPageTitleFieldId}>
            {t("notes.addNewPageToNote")}
          </label>
          <div className="flex gap-2">
            <Input
              id={newPageTitleFieldId}
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              placeholder={t("notes.newPageTitle")}
            />
            <Button
              type="button"
              size="sm"
              onClick={onAddByTitle}
              disabled={!newPageTitle.trim() || isPending}
            >
              {t("notes.add")}
            </Button>
          </div>
        </div>
        {canEdit && (
          <>
            <div className="space-y-2 border-t pt-3">
              <label className="text-sm font-medium" htmlFor={pageFilterFieldId}>
                {t("notes.searchByTitle")}
              </label>
              <Input
                id={pageFilterFieldId}
                value={pageFilter}
                onChange={(event) => setPageFilter(event.target.value)}
                placeholder={t("notes.searchByTitle")}
              />
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {filteredPages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("notes.noPagesToAdd")}</p>
                ) : (
                  filteredPages.map((page) => (
                    <div
                      key={page.id}
                      className="border-border/50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex-1 truncate">
                        {page.title || t("notes.untitledPage")}
                      </span>
                      {/*
                        リンク: 個人ページをそのままノートに参照登録する（note_id IS NULL のまま）。
                        コピー: 個人ページのスナップショットをノートネイティブページとして複製する（note_id = noteId, sourcePageId = 元）。
                        Link: reference the existing personal page (still `note_id IS NULL`, visible on /home).
                        Copy: clone the page into the note as a note-native copy (`note_id = noteId`, `sourcePageId = original`).
                        See issue #713 Phase 3.
                      */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => onAddByPageId(page.id)}
                      >
                        {t("notes.linkToNote")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => onCopyByPageId(page.id)}
                      >
                        {t("notes.copyToNote")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("notes.close")}
        </Button>
      </DialogFooter>
    </>
  );
}
