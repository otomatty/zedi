import { useState, useEffect, useCallback } from "react";
import type { Page } from "@/types/page";

interface UsePageEditorStateReturn {
  // 状態
  title: string;
  content: string;
  sourceUrl: string | undefined;
  currentPageId: string | null;
  lastSaved: number | null;
  isInitialized: boolean;
  originalTitle: string;
  contentError: ContentError | null;

  // アクション
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setSourceUrl: (sourceUrl: string | undefined) => void;
  setContentError: (error: ContentError | null) => void;
  initialize: (page: Page) => void;
  reset: () => void;
  updateLastSaved: (timestamp: number) => void;
}

export interface ContentError {
  message: string;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
  wasSanitized: boolean;
}

interface UsePageEditorStateOptions {
  pageId: string;
  isNewPage: boolean;
  onInitialized?: (page: Page) => void;
}

/**
 * Hook to manage page editor state
 * Handles page data initialization, state management, and lifecycle
 * 
 * NOTE: PageEditorViewはkey={pageId}でマウントされるため、
 * ページ遷移時は完全に再マウントされる。
 * このリセットロジックは安全のために残しているが、
 * 通常はkey変更によるコンポーネント再マウントで状態がリセットされる。
 */
export function usePageEditorState({
  pageId,
  isNewPage,
  onInitialized,
}: UsePageEditorStateOptions): UsePageEditorStateReturn {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [originalTitle, setOriginalTitle] = useState<string>("");
  const [contentError, setContentError] = useState<ContentError | null>(null);

  // ページIDが変わった時に状態をリセット
  useEffect(() => {
    // 別のページに遷移した場合、状態をリセットして再読み込みを促す
    if (currentPageId && currentPageId !== pageId && !isNewPage) {
      setIsInitialized(false);
      setCurrentPageId(null);
      setTitle("");
      setContent("");
      setSourceUrl(undefined);
      setLastSaved(null);
      setOriginalTitle("");
      setContentError(null);
    }
  }, [pageId, currentPageId, isNewPage]);

  const initialize = useCallback(
    (page: Page) => {
      setCurrentPageId(page.id);
      setTitle(page.title);
      setOriginalTitle(page.title);
      setContent(page.content);
      setSourceUrl(page.sourceUrl);
      setLastSaved(page.updatedAt);
      setIsInitialized(true);
      onInitialized?.(page);
    },
    [onInitialized]
  );

  const reset = useCallback(() => {
    setIsInitialized(false);
    setCurrentPageId(null);
    setTitle("");
    setContent("");
    setSourceUrl(undefined);
    setLastSaved(null);
    setOriginalTitle("");
    setContentError(null);
  }, []);

  const updateLastSaved = useCallback((timestamp: number) => {
    setLastSaved(timestamp);
  }, []);

  return {
    // 状態
    title,
    content,
    sourceUrl,
    currentPageId,
    lastSaved,
    isInitialized,
    originalTitle,
    contentError,

    // アクション
    setTitle,
    setContent,
    setSourceUrl,
    setContentError,
    initialize,
    reset,
    updateLastSaved,
  };
}
