import type { ReactNode } from "react";
import { PageLinkCard } from "./PageLinkCard";
import type { PageCard } from "@/hooks/useLinkedPages";

interface LinkSectionProps {
  title?: string;
  icon?: ReactNode;
  pages: PageCard[];
  onPageClick: (pageId: string) => void;
}

export function LinkSection({
  title,
  icon,
  pages,
  onPageClick,
}: LinkSectionProps) {
  if (pages.length === 0) return null;

  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          <span>
            {title} ({pages.length})
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {pages.map((page) => (
          <PageLinkCard
            key={page.id}
            page={page}
            onClick={() => onPageClick(page.id)}
          />
        ))}
      </div>
    </div>
  );
}
