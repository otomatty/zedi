import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import { generateAutoTitle } from "@/lib/contentUtils";
import type { Page } from "@/types/page";

interface UsePageEditorHandlersOptions {
  title: string;
  content: string;
  duplicatePage: Page | null;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setContentError: (error: ContentError | null) => void;
  validateTitle: (title: string) => void;
  saveChanges: (title: string, content: string) => void;
  generateWiki: (title: string) => void;
  resetWiki: () => void;
  location: { pathname: string; search: string };
}

export function usePageEditorHandlers(options: UsePageEditorHandlersOptions) {
  const navigate = useNavigate();
  const {
    title,
    content,
    duplicatePage,
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
      const autoTitle = !title ? generateAutoTitle(newContent) : title;
      if (!title && autoTitle !== "無題のページ") {
        setTitle(autoTitle);
        validateTitle(autoTitle);
      }
      saveChanges(autoTitle || title, newContent);
    },
    [title, saveChanges, validateTitle, setContent, setTitle],
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

  const handleOpenDuplicatePage = useCallback(() => {
    if (duplicatePage) {
      navigate(`/page/${duplicatePage.id}`);
    }
  }, [duplicatePage, navigate]);

  const handleGenerateWiki = useCallback(() => {
    generateWiki(title);
  }, [generateWiki, title]);

  const handleGoToAISettings = useCallback(() => {
    resetWiki();
    const returnTo = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ section: "ai", returnTo }).toString();
    navigate(`/settings?${search}`);
  }, [resetWiki, navigate, location.pathname, location.search]);

  return {
    handleContentChange,
    handleTitleChange,
    handleContentError,
    handleOpenDuplicatePage,
    handleGenerateWiki,
    handleGoToAISettings,
  };
}
