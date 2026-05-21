import React, { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { sanitizeLinkUrl } from "@/lib/markdownToTiptapHelpers";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import { useThumbnailImageSearch } from "@/components/editor/TiptapEditor/useThumbnailImageSearch";
import type { ThumbnailCandidate } from "@/components/editor/TiptapEditor/thumbnailTypes";
import type { PageActionComponentProps } from "../types";

/**
 * 「画像を検索」アクションの詳細ビュー。マウント時にタイトルで自動検索し、
 * 候補クリックで `ctx.insertThumbnail` を呼んでハブを閉じる。
 *
 * Detail view for the "thumbnail.search" action. Auto-fires a search on
 * mount, and on candidate click forwards to `ctx.insertThumbnail` then closes
 * the hub.
 */
export const ThumbnailSearchAction: React.FC<PageActionComponentProps> = ({ ctx, onClose }) => {
  const { t } = useTranslation();
  const trimmedTitle = ctx.pageTitle.trim();
  const search = useThumbnailImageSearch(trimmedTitle, ctx.isSignedIn, getThumbnailApiBaseUrl());
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialLoadFiredRef = useRef(false);

  // 詳細ビューに入った時点で初回検索を 1 回だけ走らせる（StrictMode の二重実行ガード）。
  // Fire the initial load exactly once when the detail view mounts (StrictMode guard).
  useEffect(() => {
    if (initialLoadFiredRef.current) return;
    initialLoadFiredRef.current = true;
    void search.loadCandidates();
  }, [search]);

  const handleSelectCandidate = useCallback(
    (candidate: ThumbnailCandidate) => {
      ctx.insertThumbnail(candidate.imageUrl, candidate.alt, candidate.previewUrl);
      onClose();
    },
    [ctx, onClose],
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const newScrollLeft = Math.min(Math.max(0, container.scrollLeft + event.deltaY), maxScrollLeft);
    if (newScrollLeft !== container.scrollLeft) {
      container.scrollLeft = newScrollLeft;
      event.preventDefault();
    }
  }, []);

  const handleNextPage = useCallback(() => {
    if (!search.nextCursor || search.isLoading) return;
    void search.loadCandidates(search.nextCursor);
  }, [search]);

  const handleRetry = useCallback(() => {
    void search.loadCandidates();
  }, [search]);

  return (
    <div className="space-y-3">
      {search.isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("editor.pageActionHub.actions.thumbnailSearch.loading")}
        </div>
      )}
      {search.errorMessage && (
        <div className="space-y-2">
          <div className="text-destructive text-sm">{search.errorMessage}</div>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
            {t("editor.pageActionHub.actions.thumbnailSearch.retry")}
          </Button>
        </div>
      )}
      {!search.isLoading && !search.errorMessage && search.candidates.length === 0 && (
        <div className="text-muted-foreground text-sm">
          {t("editor.pageActionHub.actions.thumbnailSearch.empty")}
        </div>
      )}

      {search.candidates.length > 0 && (
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
        >
          {search.candidates.map((candidate) => {
            const safeAuthorUrl = candidate.authorUrl ? sanitizeLinkUrl(candidate.authorUrl) : null;
            const safeSourceUrl = candidate.sourceUrl ? sanitizeLinkUrl(candidate.sourceUrl) : null;
            return (
              <div key={candidate.id} className="flex shrink-0 snap-start flex-col gap-1 text-left">
                <button
                  type="button"
                  onClick={() => handleSelectCandidate(candidate)}
                  className="bg-background rounded-md border p-1 text-left"
                >
                  <img
                    src={candidate.previewUrl}
                    alt={candidate.alt}
                    className="h-24 w-auto rounded object-cover sm:h-32"
                    loading="lazy"
                  />
                </button>
                <div className="text-muted-foreground text-[11px]">
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

      {search.nextCursor && !search.isLoading && (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={handleNextPage}>
            {t("editor.pageActionHub.actions.thumbnailSearch.next")}
          </Button>
        </div>
      )}
    </div>
  );
};
