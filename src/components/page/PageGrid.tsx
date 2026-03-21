import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useContainerColumns } from "@/hooks/useContainerColumns";
import { usePagesSummary, useSyncStatus } from "@/hooks/usePageQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";
import { Button, cn, Skeleton } from "@zedi/ui";
import { hasNeverSynced } from "@/lib/sync";
import { isTimestampInMonth } from "@/lib/dateUtils";
import type { PageSummary } from "@/types/page";

function parseMonthParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const month = params.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return month;
}

const skeletonItems = Array.from({ length: 20 }, (_, index) => index);

const gridColsClass: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/** スケルトン表示。列数は親の PageGrid で計測した columns を渡す（表示の一貫性のため） */
const PageGridSkeleton: React.FC<{ columns: 2 | 3 | 4 | 5 | 6 }> = ({ columns }) => (
  <div className={cn("grid gap-3", gridColsClass[columns])}>
    {skeletonItems.map((index) => (
      <div
        key={`page-skeleton-${index}`}
        className="page-card flex aspect-square w-full flex-col overflow-hidden rounded-lg border border-border/50 bg-card"
      >
        <div className="p-3 pb-2">
          <div className="flex items-start gap-1.5">
            <Skeleton className="h-4 w-4" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-3 pb-3">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    ))}
  </div>
);

/** 月フィルタで0件のときの空状態（全期間を表示へ誘導） */
const MonthFilterEmptyState: React.FC<{ onShowAll: () => void }> = ({ onShowAll }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <p className="mb-4 text-muted-foreground">{t("home.monthFilter.empty")}</p>
      <Button variant="outline" onClick={onShowAll}>
        {t("home.monthFilter.showAll")}
      </Button>
    </div>
  );
};

interface PageGridProps {
  isSeeding?: boolean;
}

/**
 *
 */
const PageGrid: React.FC<PageGridProps> = ({ isSeeding = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { ref, columns } = useContainerColumns();

  const { data: pages = [], isLoading } = usePagesSummary();
  const syncStatus = useSyncStatus();
  const { isSignedIn } = useAuth();

  const monthParam = parseMonthParam(searchParams.toString());

  const sortedPages = useMemo(() => {
    return [...pages].filter((p) => !p.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [pages]);

  const filteredPages = useMemo(() => {
    if (!monthParam) return sortedPages;
    return sortedPages.filter((p) => isTimestampInMonth(p.updatedAt, monthParam));
  }, [sortedPages, monthParam]);

  const isInitialSyncPending = isSignedIn && hasNeverSynced() && syncStatus !== "error";
  const hasPages = sortedPages.length > 0;
  const shouldShowSkeleton =
    !hasPages && (isLoading || syncStatus === "syncing" || isInitialSyncPending || isSeeding);

  const handleShowAll = () => {
    setSearchParams({});
  };

  return (
    <div ref={ref} className="pb-24">
      {shouldShowSkeleton && <PageGridSkeleton columns={columns} />}
      {!shouldShowSkeleton && sortedPages.length === 0 && <EmptyState />}
      {!shouldShowSkeleton &&
        sortedPages.length > 0 &&
        monthParam &&
        filteredPages.length === 0 && <MonthFilterEmptyState onShowAll={handleShowAll} />}
      {!shouldShowSkeleton &&
        sortedPages.length > 0 &&
        (!monthParam || filteredPages.length > 0) && (
          <div className={cn("grid gap-3", gridColsClass[columns])}>
            {filteredPages.map((page: PageSummary, index: number) => (
              <PageCard key={page.id} page={page} index={index} />
            ))}
          </div>
        )}
    </div>
  );
};

export default PageGrid;
