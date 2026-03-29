import React from "react";
import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import type { PageSummary } from "@/types/page";
import { cn } from "@zedi/ui";
import { useAuthenticatedImageUrl } from "@/hooks/useAuthenticatedImageUrl";

interface NotePageCardProps {
  noteId: string;
  page: PageSummary;
}

/**
 *
 */
export /**
 *
 */
const NotePageCard: React.FC<NotePageCardProps> = ({ noteId, page }) => {
  /**
   *
   */
  const navigate = useNavigate();

  /**
   *
   */
  const preview = page.contentPreview ?? "";
  /**
   *
   */
  const { resolvedUrl: thumbnail, hasError: thumbnailError } = useAuthenticatedImageUrl(
    page.thumbnailUrl,
  );
  /**
   *
   */
  const isClipped = !!page.sourceUrl;

  /**
   *
   */
  const handleClick = () => {
    navigate(`/note/${noteId}/page/${page.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full overflow-hidden rounded-lg text-left",
        "border-border/50 bg-card hover:border-border border",
        "group transition-all duration-200",
        "flex aspect-square flex-col",
      )}
    >
      <div className="flex-shrink-0 p-3 pb-2">
        <div className="flex items-start gap-1.5">
          {isClipped && <Link2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />}
          <h3 className="text-foreground line-clamp-2 text-sm font-medium">
            {page.title || "無題のページ"}
          </h3>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {thumbnail && !thumbnailError ? (
          <div className="flex h-full w-full items-center justify-center px-3 pt-0 pb-3">
            <img
              src={thumbnail}
              alt=""
              className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              decoding="async"
              loading="lazy"
              {...({ fetchpriority: "low" } as React.ImgHTMLAttributes<HTMLImageElement>)}
            />
          </div>
        ) : (
          <div className="h-full px-3 pb-3">
            <p className="text-muted-foreground line-clamp-4 text-xs leading-relaxed">
              {preview || "コンテンツがありません"}
            </p>
          </div>
        )}
      </div>
    </button>
  );
};
