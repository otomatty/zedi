import React from 'react';
import type { DateGroup } from '@/types/page';
import PageCard from './PageCard';

interface DateSectionProps {
  group: DateGroup;
  startIndex: number;
}

const DateSection: React.FC<DateSectionProps> = ({ group, startIndex }) => {
  return (
    <section className="mb-8">
      {/* Date Header */}
      <div className="date-header py-3 mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {group.label}
        </h2>
      </div>
      
      {/* Page Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {group.pages.map((page, index) => (
          <PageCard
            key={page.id}
            page={page}
            index={startIndex + index}
          />
        ))}
      </div>
    </section>
  );
};

export default DateSection;
