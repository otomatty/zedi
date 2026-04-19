import React, { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useContainerColumns } from "@/hooks/useContainerColumns";
import { usePagesSummary, useSyncStatus } from "@/hooks/usePageQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";
import { cn, Skeleton } from "@zedi/ui";
import { hasNeverSynced } from "@/lib/sync";
import type { PageSummary } from "@/types/page";

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
        className="page-card border-border/50 bg-card flex aspect-square w-full flex-col overflow-hidden rounded-lg border"
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

interface PageGridProps {
  isSeeding?: boolean;
}

/**
 * Grid of recent pages for the home page. Shows a skeleton while the initial
 * data is loading (including first-time sign-in syncs), an empty state when
 * the user has no pages, and the actual grid otherwise.
 *
 * ホーム用のページグリッド。初回同期などロード中はスケルトン、ページが無い場合は空状態、
 * それ以外はグリッドを表示する 3 状態構成。
 */
const PageGrid: React.FC<PageGridProps> = ({ isSeeding = false }) => {
  const { ref, columns } = useContainerColumns();

  const { data: pages = [], isLoading } = usePagesSummary();
  const syncStatus = useSyncStatus();
  const { isSignedIn } = useAuth();

  const sortedPages = useMemo(() => {
    return [...pages].filter((p) => !p.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [pages]);

  const isInitialSyncPending = isSignedIn && hasNeverSynced() && syncStatus !== "error";
  const hasPages = sortedPages.length > 0;
  const shouldShowSkeleton =
    !hasPages && (isLoading || syncStatus === "syncing" || isInitialSyncPending || isSeeding);

  return (
    <div ref={ref} className="pb-24">
      {shouldShowSkeleton && <PageGridSkeleton columns={columns} />}
      {!shouldShowSkeleton && sortedPages.length === 0 && <EmptyState />}
      {!shouldShowSkeleton && sortedPages.length > 0 && (
        <div className={cn("grid gap-3", gridColsClass[columns])}>
          {sortedPages.map((page: PageSummary, index: number) => (
            <PageCard key={page.id} page={page} index={index} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PageGrid;
