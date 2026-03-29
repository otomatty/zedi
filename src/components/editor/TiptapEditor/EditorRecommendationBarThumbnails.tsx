import React from "react";
import { Loader2 } from "lucide-react";
import { sanitizeLinkUrl } from "@/lib/markdownToTiptapHelpers";
import type { ThumbnailCandidate } from "./EditorRecommendationBarTypes";

interface EditorRecommendationBarThumbnailsProps {
  candidates: ThumbnailCandidate[];
  isLoading: boolean;
  errorMessage: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onSelectCandidate: (candidate: ThumbnailCandidate) => void;
}

/**
 *
 */
export /**
 *
 */
const EditorRecommendationBarThumbnails: React.FC<EditorRecommendationBarThumbnailsProps> = ({
  candidates,
  isLoading,
  errorMessage,
  scrollRef,
  onWheel,
  onSelectCandidate,
}) => (
  <div className="space-y-2">
    {isLoading && (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        画像を検索中...
      </div>
    )}
    {errorMessage && <div className="text-destructive text-xs">{errorMessage}</div>}
    {!isLoading && !errorMessage && candidates.length === 0 && (
      <div className="text-muted-foreground text-xs">候補が見つかりませんでした</div>
    )}

    {candidates.length > 0 && (
      <div
        ref={scrollRef}
        onWheel={onWheel}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {candidates.map((candidate) => {
          /**
           *
           */
          const safeAuthorUrl = candidate.authorUrl ? sanitizeLinkUrl(candidate.authorUrl) : null;
          /**
           *
           */
          const safeSourceUrl = candidate.sourceUrl ? sanitizeLinkUrl(candidate.sourceUrl) : null;
          return (
            <div key={candidate.id} className="flex shrink-0 snap-start flex-col gap-1 text-left">
              <button
                type="button"
                onClick={() => onSelectCandidate(candidate)}
                className="bg-background rounded-md border p-1 text-left"
              >
                <img
                  src={candidate.previewUrl}
                  alt={candidate.alt}
                  className="h-16 w-auto rounded object-cover sm:h-24"
                  loading="lazy"
                />
              </button>
              <div className="text-muted-foreground text-[10px]">
                {candidate.authorName ? (
                  <>
                    {safeAuthorUrl ? (
                      <a
                        href={safeAuthorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {candidate.authorName}
                      </a>
                    ) : (
                      <span>{candidate.authorName}</span>
                    )}{" "}
                    /{" "}
                  </>
                ) : null}
                {safeSourceUrl ? (
                  <a
                    href={safeSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {candidate.sourceName}
                  </a>
                ) : (
                  <span>{candidate.sourceName}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
