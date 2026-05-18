import type { ReactNode } from "react";
import { PageLinkCard } from "./PageLinkCard";
import type { PageCard } from "@/hooks/useLinkedPages";

interface LinkSectionProps {
  title?: string;
  icon?: ReactNode;
  pages: PageCard[];
  /**
   * 遷移先 URL は `/notes/:noteId/:pageId` のため、呼び出し元には pageId に
   * 加えて noteId も渡す（Issue #889 Phase 3）。
   * `/notes/:noteId/:pageId` requires both ids — pass the page's `noteId` to
   * the parent (Issue #889 Phase 3).
   */
  onPageClick: (pageId: string, noteId: string) => void;
}

/**
 *
 */
export function LinkSection({ title, icon, pages, onPageClick }: LinkSectionProps) {
  if (pages.length === 0) return null;

  return (
    <div className="space-y-3">
      {title && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pages.map((page) => (
          <PageLinkCard
            key={page.id}
            page={page}
            onClick={() => onPageClick(page.id, page.noteId)}
          />
        ))}
      </div>
    </div>
  );
}
