import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import Container from "@/components/layout/Container";
import { Button } from "@/components/ui/button";

const THUMBNAIL_API_BASE_URL =
  import.meta.env.VITE_THUMBNAIL_API_BASE_URL || "";

interface ThumbnailCandidate {
  id: string;
  previewUrl: string;
  imageUrl: string;
  alt: string;
  sourceName: string;
  sourceUrl: string;
  authorName?: string;
  authorUrl?: string;
}

interface EditorRecommendationBarProps {
  pageTitle: string;
  isReadOnly: boolean;
  hasThumbnail: boolean;
  onSelectThumbnail: (
    imageUrl: string,
    alt: string,
    previewUrl?: string
  ) => void;
}

type RecommendationMode = "actions" | "thumbnails" | "generating";

export const EditorRecommendationBar: React.FC<EditorRecommendationBarProps> = ({
  pageTitle,
  isReadOnly,
  hasThumbnail,
  onSelectThumbnail,
}) => {
  const [mode, setMode] = useState<RecommendationMode>("actions");
  const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const lastQueryRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trimmedTitle = pageTitle.trim();
  const canSearch = !isReadOnly && !hasThumbnail;

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    scrollRef.current.scrollLeft += event.deltaY;
    event.preventDefault();
  }, []);

  const loadCandidates = useCallback(
    async (cursor?: string | null) => {
    if (!trimmedTitle) {
      setErrorMessage("タイトルを入力してください");
      return;
    }

    const query = trimmedTitle;
    lastQueryRef.current = query;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        query,
        limit: "10",
      });
      if (cursor) {
        params.set("cursor", cursor);
      }
      const response = await fetch(
        `${THUMBNAIL_API_BASE_URL}/api/image-search?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`画像検索に失敗しました: ${response.status}`);
      }

      const data = (await response.json()) as {
        items?: ThumbnailCandidate[];
        nextCursor?: string;
      };

      setCandidates(data.items || []);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "画像の取得に失敗しました"
      );
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  },
    [trimmedTitle]
  );

  const handleOpenThumbnailPicker = useCallback(() => {
    if (!canSearch) return;
    setMode("thumbnails");
    if (lastQueryRef.current !== trimmedTitle) {
      setCandidates([]);
      setNextCursor(null);
    }
    if (candidates.length === 0) {
      void loadCandidates();
    }
  }, [canSearch, candidates.length, loadCandidates, trimmedTitle]);

  const handleBackToActions = useCallback(() => {
    setMode("actions");
    setErrorMessage(null);
  }, []);

  const handleSelectCandidate = useCallback(
    (candidate: ThumbnailCandidate) => {
      onSelectThumbnail(candidate.imageUrl, candidate.alt, candidate.previewUrl);
      setMode("actions");
      setErrorMessage(null);
    },
    [onSelectThumbnail]
  );

  const handleNextPage = useCallback(() => {
    if (!nextCursor || isLoading) return;
    void loadCandidates(nextCursor);
  }, [isLoading, loadCandidates, nextCursor]);

  const handleGenerateImage = useCallback(async () => {
    if (!trimmedTitle) {
      setErrorMessage("タイトルを入力してください");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setMode("generating");

    try {
      const response = await fetch(
        `${THUMBNAIL_API_BASE_URL}/api/image-generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: trimmedTitle,
            aspectRatio: "16:9",
            imageSize: "2K",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `画像生成に失敗しました: ${response.status}`
        );
      }

      const data = (await response.json()) as {
        imageUrl: string;
        mimeType: string;
      };

      // base64データURIをそのまま使用
      onSelectThumbnail(data.imageUrl, trimmedTitle, data.imageUrl);
      setMode("actions");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "画像の生成に失敗しました"
      );
      setMode("actions");
    } finally {
      setIsLoading(false);
    }
  }, [trimmedTitle, onSelectThumbnail]);

  const headerLabel = useMemo(() => {
    if (mode === "generating") return "画像を生成中";
    return mode === "actions" ? "おすすめ" : "サムネイル候補";
  }, [mode]);

  if (!canSearch) return null;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex flex-col gap-2 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>{headerLabel}</span>
          </div>
          {mode === "thumbnails" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleNextPage}
                disabled={!nextCursor || isLoading}
              >
                次へ
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleBackToActions}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                戻る
              </Button>
            </div>
          )}
        </div>

        {mode === "actions" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleOpenThumbnailPicker}
            >
              <ImageIcon className="h-4 w-4 mr-1" />
              画像を検索
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleGenerateImage}
              disabled={isLoading}
            >
              <Wand2 className="h-4 w-4 mr-1" />
              AIで生成
            </Button>
            <span className="text-xs text-muted-foreground">
              タイトルから画像を検索または生成します
            </span>
          </div>
        )}

        {mode === "generating" && (
          <div className="space-y-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                画像を生成中...
              </div>
            )}
            {errorMessage && (
              <div className="text-xs text-destructive">{errorMessage}</div>
            )}
            {!isLoading && !errorMessage && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleBackToActions}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  戻る
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === "thumbnails" && (
          <div className="space-y-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                画像を検索中...
              </div>
            )}
            {errorMessage && (
              <div className="text-xs text-destructive">{errorMessage}</div>
            )}
            {!isLoading && !errorMessage && candidates.length === 0 && (
              <div className="text-xs text-muted-foreground">
                候補が見つかりませんでした
              </div>
            )}

            {candidates.length > 0 && (
              <div
                ref={scrollRef}
                onWheel={handleWheel}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1"
              >
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelectCandidate(candidate)}
                    className="snap-start shrink-0 text-left"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="rounded-md border bg-background p-1">
                        <img
                          src={candidate.previewUrl}
                          alt={candidate.alt}
                          className="h-16 sm:h-24 w-auto rounded object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {candidate.authorName ? (
                          <>
                            <a
                              href={candidate.authorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2"
                            >
                              {candidate.authorName}
                            </a>{" "}
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
        )}
      </Container>
    </div>
  );
};
