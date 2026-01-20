import React, { useMemo } from "react";
import { usePages } from "@/hooks/usePageQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";

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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
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
