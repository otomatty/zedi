import React, { useMemo } from "react";
import { usePages } from "@/hooks/usePageQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

const skeletonItems = Array.from({ length: 20 }, (_, index) => index);

const PageGridSkeleton: React.FC = () => {
  return (
    <div className="pb-24">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {skeletonItems.map((index) => (
          <div
            key={`page-skeleton-${index}`}
            className="page-card w-full rounded-lg overflow-hidden bg-card border border-border/50 aspect-square flex flex-col"
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
            <div className="flex-1 min-h-0 px-3 pb-3">
              <Skeleton className="h-full w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PageGrid: React.FC = () => {
  // Use SQLite (local or Turso depending on auth state)
  const { data: pages = [], isLoading } = usePages();

  const sortedPages = useMemo(() => {
    return [...pages]
      .filter((p) => !p.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [pages]);

  // Show loading state
  if (isLoading) {
    return <PageGridSkeleton />;
  }

  if (sortedPages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="pb-24">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {sortedPages.map((page, index) => (
          <PageCard key={page.id} page={page} index={index} />
        ))}
      </div>
    </div>
  );
};

export default PageGrid;
