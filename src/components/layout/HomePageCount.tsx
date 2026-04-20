import React from "react";
import { useTranslation } from "react-i18next";
import { usePagesSummary } from "@/hooks/usePageQueries";

/**
 * ホーム用の総ページ数表示。削除済みを除いた件数を表示する。
 * モバイルでは FAB の親指リーチ領域と重なるため非表示にする。
 *
 * Home page total count label (excludes deleted pages). Hidden on mobile
 * because it would overlap the FAB's thumb-reach area.
 */
export const HomePageCount: React.FC = () => {
  const { t } = useTranslation();
  const { data: pagesSummary, isLoading } = usePagesSummary();
  const pageCount = (pagesSummary ?? []).filter((p) => !p.isDeleted).length;

  if (isLoading || pagesSummary === undefined) {
    return null;
  }

  return (
    <span className="border-border bg-background text-muted-foreground hidden items-center gap-2 border px-2.5 py-1 text-sm md:flex">
      <span>{t("home.pageCountLabel")}</span>
      <span className="bg-border h-4 w-px shrink-0" aria-hidden />
      <span>{t("home.totalPages", { count: pageCount })}</span>
    </span>
  );
};

export default HomePageCount;
