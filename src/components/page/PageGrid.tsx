import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePagesSummary, useSyncStatus } from "@/hooks/usePageQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";
import { Skeleton } from "@zedi/ui";
import { hasNeverSynced } from "@/lib/sync";
import { isTimestampInMonth } from "@/lib/dateUtils";
import { Button } from "@zedi/ui";
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

const PageGridSkeleton: React.FC = () => {
  return (
    <div className="pb-24">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
    </div>
  );
};

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

const PageGrid: React.FC<PageGridProps> = ({ isSeeding = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();

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

  if (shouldShowSkeleton) {
    return <PageGridSkeleton />;
  }

  if (sortedPages.length === 0) {
    return <EmptyState />;
  }

  if (monthParam && filteredPages.length === 0) {
    return <MonthFilterEmptyState onShowAll={handleShowAll} />;
  }

  return (
    <div className="pb-24">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filteredPages.map((page: PageSummary, index: number) => (
          <PageCard key={page.id} page={page} index={index} />
        ))}
      </div>
    </div>
  );
};

export default PageGrid;
