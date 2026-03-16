import React from "react";
import { useTranslation } from "react-i18next";
import { usePagesSummary } from "@/hooks/usePageQueries";

/**
 * ホーム用の総ページ数表示。削除済みを除いた件数を表示する。
 * Home page total count label (excludes deleted pages).
 */
export const HomePageCount: React.FC = () => {
  const { t } = useTranslation();
  const { data: pagesSummary, isLoading } = usePagesSummary();
  const pageCount = (pagesSummary ?? []).filter((p) => !p.isDeleted).length;

  if (isLoading || pagesSummary === undefined) {
    return null;
  }

  return (
    <span className="flex items-center gap-2 border border-border bg-background px-2.5 py-1 text-sm text-muted-foreground">
      <span>{t("home.pageCountLabel")}</span>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <span>{t("home.totalPages", { count: pageCount })}</span>
    </span>
  );
};

export default HomePageCount;
