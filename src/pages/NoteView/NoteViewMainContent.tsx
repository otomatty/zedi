import { useTranslation } from "react-i18next";
import type { NotePageSummary } from "./noteViewHelpers";
import { NoteViewPageGrid } from "./NoteViewPageGrid";

/**
 *
 */
export interface NoteViewMainContentProps {
  noteId: string;
  notePages: NotePageSummary[];
  isPagesLoading: boolean;
  canDeletePage: (addedByUserId: string | null | undefined) => boolean;
  onRemovePage: (pageId: string) => Promise<void>;
}

/**
 *
 */
export function NoteViewMainContent({
  noteId,
  notePages,
  isPagesLoading,
  canDeletePage,
  onRemovePage,
}: NoteViewMainContentProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <div className="mt-4">
      {isPagesLoading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : notePages.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("notes.noPagesYet")}</p>
      ) : (
        <NoteViewPageGrid
          noteId={noteId}
          notePages={notePages}
          canDeletePage={canDeletePage}
          onRemovePage={onRemovePage}
        />
      )}
    </div>
  );
}
