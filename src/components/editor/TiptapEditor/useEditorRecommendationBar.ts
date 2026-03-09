import { useCallback, useMemo, useRef, useState } from "react";
import type {
  EditorRecommendationBarProps,
  RecommendationMode,
  ThumbnailCandidate,
} from "./EditorRecommendationBarTypes";
import { getThumbnailApiBaseUrl } from "./thumbnailApiHelpers";
import { useThumbnailImageSearch } from "./useThumbnailImageSearch";
import { useThumbnailImageGenerate } from "./useThumbnailImageGenerate";
import { useAuth } from "@/hooks/useAuth";

export function useEditorRecommendationBar({
  pageTitle,
  isReadOnly,
  hasThumbnail,
  onSelectThumbnail,
}: EditorRecommendationBarProps) {
  const { isSignedIn } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [mode, setMode] = useState<RecommendationMode>("actions");
  const [generatingErrorMessage, setGeneratingErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trimmedTitle = pageTitle.trim();
  const thumbnailApiBaseUrl = getThumbnailApiBaseUrl();
  const canSearch = !isReadOnly && !hasThumbnail;

  const search = useThumbnailImageSearch(trimmedTitle, isSignedIn, thumbnailApiBaseUrl);
  const { generateImage, isGenerating } = useThumbnailImageGenerate(
    trimmedTitle,
    isSignedIn,
    onSelectThumbnail,
  );

  const isLoading = search.isLoading || isGenerating;
  const errorMessage = mode === "generating" ? generatingErrorMessage : search.errorMessage;

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    scrollRef.current.scrollLeft += event.deltaY;
    event.preventDefault();
  }, []);

  const handleOpenThumbnailPicker = useCallback(() => {
    if (!canSearch) return;
    setMode("thumbnails");
    if (search.lastQueryRef.current !== trimmedTitle) {
      search.resetSearch();
    }
    if (search.candidates.length === 0) {
      void search.loadCandidates();
    }
  }, [canSearch, search, trimmedTitle]);

  const handleBackToActions = useCallback(() => {
    setMode("actions");
    search.setErrorMessage(null);
    setGeneratingErrorMessage(null);
  }, [search]);

  const handleSelectCandidate = useCallback(
    (candidate: ThumbnailCandidate) => {
      onSelectThumbnail(candidate.imageUrl, candidate.alt, candidate.previewUrl);
      setMode("actions");
      search.setErrorMessage(null);
    },
    [onSelectThumbnail, search],
  );

  const handleNextPage = useCallback(() => {
    if (!search.nextCursor || isLoading) return;
    void search.loadCandidates(search.nextCursor);
  }, [isLoading, search]);

  const handleGenerateImage = useCallback(async () => {
    setGeneratingErrorMessage(null);
    setMode("generating");
    const err = await generateImage();
    if (err) {
      setGeneratingErrorMessage(err);
    } else {
      setMode("actions");
    }
  }, [generateImage]);

  const dismiss = useCallback(() => setIsDismissed(true), []);

  const headerLabel = useMemo(() => {
    if (mode === "generating") return "画像を生成中";
    return mode === "actions" ? "おすすめ" : "サムネイル候補";
  }, [mode]);

  return {
    canSearch,
    isDismissed,
    mode,
    headerLabel,
    isLoading,
    errorMessage,
    candidates: search.candidates,
    nextCursor: search.nextCursor,
    scrollRef,
    handleWheel,
    handleOpenThumbnailPicker,
    handleBackToActions,
    handleSelectCandidate,
    handleNextPage,
    handleGenerateImage,
    dismiss,
  };
}
