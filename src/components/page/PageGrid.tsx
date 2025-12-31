import React, { useMemo } from "react";
import { usePages } from "@/hooks/usePageQueries";
import { groupPagesByDate } from "@/lib/dateUtils";
import DateSection from "./DateSection";
import EmptyState from "./EmptyState";

const PageGrid: React.FC = () => {
  // Use SQLite (local or Turso depending on auth state)
  const { data: pages = [], isLoading } = usePages();

  const dateGroups = useMemo(() => {
    return groupPagesByDate(pages);
  }, [pages]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (dateGroups.length === 0) {
    return <EmptyState />;
  }

  let runningIndex = 0;

  return (
    <div className="pb-24">
      {dateGroups.map((group) => {
        const startIndex = runningIndex;
        runningIndex += group.pages.length;

        return (
          <DateSection key={group.date} group={group} startIndex={startIndex} />
        );
      })}
    </div>
  );
};

export default PageGrid;
