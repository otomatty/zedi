import React, { useMemo } from 'react';
import { usePageStore } from '@/stores/pageStore';
import { groupPagesByDate } from '@/lib/dateUtils';
import DateSection from './DateSection';
import EmptyState from './EmptyState';

const PageGrid: React.FC = () => {
  const { pages } = usePageStore();
  
  const dateGroups = useMemo(() => {
    return groupPagesByDate(pages);
  }, [pages]);

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
          <DateSection
            key={group.date}
            group={group}
            startIndex={startIndex}
          />
        );
      })}
    </div>
  );
};

export default PageGrid;
