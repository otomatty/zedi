import { useId } from "react";
import { Button, DialogFooter, DialogHeader, DialogTitle, Input } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { NotePageSummary } from "./noteViewHelpers";

/**
 * Dialog body: add page by title and optional search list (when canEdit).
 * ページ追加ダイアログ（タイトル入力と、編集可時は検索リスト）。
 */
export interface NoteViewAddPageDialogContentProps {
  newPageTitle: string;
  setNewPageTitle: (v: string) => void;
  pageFilter: string;
  setPageFilter: (v: string) => void;
  filteredPages: NotePageSummary[];
  canEdit: boolean;
  onAddByTitle: () => Promise<void>;
  onAddByPageId: (pageId: string) => Promise<void>;
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
                  <p className="text-sm text-muted-foreground">{t("notes.noPagesToAdd")}</p>
                ) : (
                  filteredPages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => onAddByPageId(page.id)}
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
        <Button type="button" variant="outline" onClick={onClose}>
          {t("notes.close")}
        </Button>
      </DialogFooter>
    </>
  );
}
