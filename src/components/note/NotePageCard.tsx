import React from "react";
import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import type { PageSummary } from "@/types/page";
import { cn } from "@/lib/utils";

interface NotePageCardProps {
  noteId: string;
  page: PageSummary;
}

export const NotePageCard: React.FC<NotePageCardProps> = ({ noteId, page }) => {
  const navigate = useNavigate();

  const preview = page.contentPreview ?? "";
  const thumbnail = page.thumbnailUrl;
  const isClipped = !!page.sourceUrl;

  const handleClick = () => {
    navigate(`/note/${noteId}/page/${page.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-lg overflow-hidden",
        "bg-card border border-border/50 hover:border-border",
        "transition-all duration-200 group",
        "aspect-square flex flex-col"
      )}
    >
      <div className="p-3 pb-2 flex-shrink-0">
        <div className="flex items-start gap-1.5">
          {isClipped && (
            <Link2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          )}
          <h3 className="font-medium text-sm text-foreground line-clamp-2">
            {page.title || "無題のページ"}
          </h3>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {thumbnail ? (
          <div className="h-full w-full px-3 pb-3 pt-0 flex items-center justify-center">
            <img
              src={thumbnail}
              alt=""
              className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
              decoding="async"
              fetchPriority="low"
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
