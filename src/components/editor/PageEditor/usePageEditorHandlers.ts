import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import { generateAutoTitle } from "@/lib/contentUtils";

interface UsePageEditorHandlersOptions {
  title: string;
  content: string;
  /** true のときだけオートタイトル（コンテンツ先頭行からの自動生成）を有効にする */
  enableAutoTitle: boolean;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setContentError: (error: ContentError | null) => void;
  validateTitle: (title: string) => void;
  saveChanges: (title: string, content: string) => void;
  generateWiki: (title: string) => void;
  resetWiki: () => void;
  location: { pathname: string; search: string; hash?: string };
}

/** Page editor event handlers (title, content, wiki, navigation). */
export function usePageEditorHandlers(options: UsePageEditorHandlersOptions) {
  const navigate = useNavigate();
  const {
    title,
    content,
    enableAutoTitle,
    setTitle,
    setContent,
    setContentError,
    validateTitle,
    saveChanges,
    generateWiki,
    resetWiki,
    location,
  } = options;

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      if (enableAutoTitle && !title) {
        const autoTitle = generateAutoTitle(newContent);
        if (autoTitle !== "無題のページ") {
          setTitle(autoTitle);
          validateTitle(autoTitle);
          saveChanges(autoTitle, newContent);
          return;
        }
        saveChanges("無題のページ", newContent);
        return;
      }
      saveChanges(title, newContent);
    },
    [title, enableAutoTitle, saveChanges, validateTitle, setContent, setTitle],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      validateTitle(newTitle);
      saveChanges(newTitle, content);
    },
    [content, saveChanges, validateTitle, setTitle],
  );

  const handleContentError = useCallback(
    (error: ContentError | null) => {
      setContentError(error);
    },
    [setContentError],
  );

  const handleGenerateWiki = useCallback(() => {
    generateWiki(title);
  }, [generateWiki, title]);

  const handleGoToAISettings = useCallback(() => {
    resetWiki();
    const returnTo = `${location.pathname}${location.search}${location.hash ?? ""}`;
    const search = new URLSearchParams({ section: "ai", returnTo }).toString();
    navigate(`/settings?${search}`);
  }, [resetWiki, navigate, location.pathname, location.search, location.hash]);

  return {
    handleContentChange,
    handleTitleChange,
    handleContentError,
    handleGenerateWiki,
    handleGoToAISettings,
  };
}
