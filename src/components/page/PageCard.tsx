import React from "react";
import { useNavigate } from "react-router-dom";
import type { Page } from "@/types/page";
import { getContentPreview, extractFirstImage } from "@/lib/contentUtils";
import { cn } from "@/lib/utils";

interface PageCardProps {
  page: Page;
  index?: number;
}

const PageCard: React.FC<PageCardProps> = ({ page, index = 0 }) => {
  const navigate = useNavigate();
  const preview = getContentPreview(page.content, 120);
  const thumbnail = page.thumbnailUrl || extractFirstImage(page.content);

  const handleClick = () => {
    navigate(`/page/${page.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "page-card w-full text-left rounded-lg overflow-hidden",
        "bg-card border border-border/50 hover:border-border",
        "transition-all duration-200 group",
        "animate-fade-in opacity-0",
        "aspect-square flex flex-col",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`
      )}
      style={{
        animationFillMode: "forwards",
        animationDelay: `${index * 50}ms`,
      }}
    >
      {/* Title - Top */}
      <div className="p-3 pb-2 flex-shrink-0">
        <h3 className="font-medium text-sm text-foreground line-clamp-2">
          {page.title || "無題のページ"}
        </h3>
      </div>

      {/* Thumbnail or Preview - Bottom */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {thumbnail ? (
          <div className="h-full w-full overflow-hidden bg-muted">
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="h-full px-3 pb-3">
            <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
              {preview || "コンテンツがありません"}
            </p>
          </div>
        )}
      </div>
    </button>
  );
};

export default PageCard;
