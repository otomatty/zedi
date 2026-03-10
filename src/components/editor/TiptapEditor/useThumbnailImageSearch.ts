import { useCallback, useMemo, useRef, useState } from "react";
import type { ThumbnailCandidate } from "./EditorRecommendationBarTypes";

export function useThumbnailImageSearch(
  trimmedTitle: string,
  isSignedIn: boolean,
  thumbnailApiBaseUrl: string,
) {
  const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const lastQueryRef = useRef<string | null>(null);

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
        if (!isSignedIn) {
          setErrorMessage("ログインが必要です");
          return;
        }
        const params = new URLSearchParams({
          query,
          limit: "10",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        const response = await fetch(
          `${thumbnailApiBaseUrl}/api/thumbnail/image-search?${params.toString()}`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error(`画像検索に失敗しました: ${response.status}`);
        }

        const data = (await response.json()) as {
          items?: ThumbnailCandidate[];
          nextCursor?: string;
        };

        setCandidates((prev) => (cursor ? [...prev, ...(data.items || [])] : data.items || []));
        setNextCursor(data.nextCursor ?? null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "画像の取得に失敗しました");
        setNextCursor(null);
      } finally {
        setIsLoading(false);
      }
    },
    [isSignedIn, thumbnailApiBaseUrl, trimmedTitle],
  );

  const resetSearch = useCallback(() => {
    setCandidates([]);
    setNextCursor(null);
    setErrorMessage(null);
  }, []);

  return useMemo(
    () => ({
      candidates,
      nextCursor,
      isLoading,
      errorMessage,
      setErrorMessage,
      lastQueryRef,
      loadCandidates,
      resetSearch,
    }),
    [candidates, nextCursor, isLoading, errorMessage, loadCandidates, resetSearch],
  );
}
