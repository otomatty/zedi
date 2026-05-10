import React from "react";
import { useTranslation } from "react-i18next";
import { useNotePages } from "@/hooks/useNoteQueries";

/**
 * 指定ノートの総ページ数バッジ。削除済みを除いた件数を表示する。
 * モバイルでは FAB の親指リーチ領域と重なるため非表示にする。
 *
 * Per-note total page count badge (excludes deleted pages). Hidden on mobile
 * because it would overlap the FAB's thumb-reach area.
 */
export const NotePageCount: React.FC<{ noteId: string }> = ({ noteId }) => {
  const { t } = useTranslation();
  const { data: notePages, isLoading } = useNotePages(noteId);
  const pageCount = (notePages ?? []).filter((p) => !p.isDeleted).length;

  if (isLoading || notePages === undefined) {
    return null;
  }

  return (
    <span className="border-border bg-background text-muted-foreground hidden items-center gap-2 border px-2.5 py-1 text-sm md:flex">
      <span>{t("notes.pageCountLabel")}</span>
      <span className="bg-border h-4 w-px shrink-0" aria-hidden />
      <span>{t("notes.totalPages", { count: pageCount })}</span>
    </span>
  );
};

export default NotePageCount;
