import React from "react";
import { Loader2 } from "lucide-react";
import type { ThumbnailCandidate } from "./EditorRecommendationBarTypes";

interface EditorRecommendationBarThumbnailsProps {
  candidates: ThumbnailCandidate[];
  isLoading: boolean;
  errorMessage: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onSelectCandidate: (candidate: ThumbnailCandidate) => void;
}

export const EditorRecommendationBarThumbnails: React.FC<
  EditorRecommendationBarThumbnailsProps
> = ({ candidates, isLoading, errorMessage, scrollRef, onWheel, onSelectCandidate }) => (
  <div className="space-y-2">
    {isLoading && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        画像を検索中...
      </div>
    )}
    {errorMessage && <div className="text-xs text-destructive">{errorMessage}</div>}
    {!isLoading && !errorMessage && candidates.length === 0 && (
      <div className="text-xs text-muted-foreground">候補が見つかりませんでした</div>
    )}

    {candidates.length > 0 && (
      <div
        ref={scrollRef}
        onWheel={onWheel}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelectCandidate(candidate)}
            className="shrink-0 snap-start text-left"
          >
            <div className="flex flex-col gap-1">
              <div className="rounded-md border bg-background p-1">
                <img
                  src={candidate.previewUrl}
                  alt={candidate.alt}
                  className="h-16 w-auto rounded object-cover sm:h-24"
                  loading="lazy"
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                {candidate.authorName ? (
                  <>
                    {candidate.authorUrl ? (
                      <a
                        href={candidate.authorUrl}
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
                <a
                  href={candidate.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {candidate.sourceName}
                </a>
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);
