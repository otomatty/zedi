import React from "react";
import type { DateGroup } from "@/types/page";
import PageCard from "./PageCard";

interface DateSectionProps {
  group: DateGroup;
  startIndex: number;
}

const DateSection: React.FC<DateSectionProps> = ({ group, startIndex }) => {
  return (
    <section className="mb-8">
      {/* Date Header */}
      <div className="date-header mb-4 py-3">
        <h2 className="text-sm font-medium text-muted-foreground">{group.label}</h2>
      </div>

      {/* Page Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {group.pages.map((page, index) => (
          <PageCard key={page.id} page={page} index={startIndex + index} />
        ))}
      </div>
    </section>
  );
};

export default DateSection;
