import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePage, useUpdatePage } from "@/hooks/usePageQueries";
import { useTitleValidation } from "@/hooks/useTitleValidation";
import { useToast } from "@zedi/ui";
import { useWikiGenerator } from "@/hooks/useWikiGenerator";
import { useCollaboration } from "@/hooks/useCollaboration";
import { usePageEditorState } from "./usePageEditorState";
import { usePageEditorAutoSaveWithMutation } from "./usePageEditorAutoSaveWithMutation";
import { usePageEditorEffects } from "./usePageEditorEffects";
import { usePageDeletion } from "./usePageDeletion";
import { useMarkdownExport } from "./useMarkdownExport";
import { usePageEditorKeyboard } from "./usePageEditorKeyboard";

export function usePageEditorStateAndSync() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const isNewPage = id === "new";
  const pageId = isNewPage ? "" : id || "";

  const { data: page, isLoading, isError } = usePage(pageId);
  const updatePageMutation = useUpdatePage();

  const {
    title,
    content,
    sourceUrl,
    currentPageId,
    lastSaved,
    isInitialized,
    contentError,
    setTitle,
    setContent,
    setSourceUrl,
    setContentError,
    initialize,
    updateLastSaved,
  } = usePageEditorState({
    pageId,
    isNewPage,
    onInitialized: (page) => {
      initializeWithTitle(page.title);
    },
  });

  const isLocalDocEnabled = Boolean(currentPageId && !isNewPage);
  const collaboration = useCollaboration({
    pageId: currentPageId ?? "",
    enabled: isLocalDocEnabled,
    mode: "local",
  });

  const { duplicatePage, errorMessage, validateTitle, initializeWithTitle, shouldBlockSave } =
    useTitleValidation({
      currentPageId: currentPageId || undefined,
      isNewPage,
      debounceMs: 300,
    });

  const {
    status: wikiStatus,
    error: wikiError,
    generate: generateWiki,
    cancel: cancelWiki,
    reset: resetWiki,
    throttledTiptapContent,
    getTiptapContent,
  } = useWikiGenerator();

  const isWikiGenerating = wikiStatus === "generating";

  const {
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
  } = usePageDeletion({
    currentPageId,
    title,
    content,
    shouldBlockSave,
  });

  const { handleExportMarkdown, handleCopyMarkdown } = useMarkdownExport(title, content, sourceUrl);
  usePageEditorKeyboard({ onBack: handleBack });

  const {
    saveChanges,
    lastSaved: autoSaveLastSaved,
    isSyncingLinks,
  } = usePageEditorAutoSaveWithMutation({
    currentPageId,
    shouldBlockSave,
    updateLastSaved,
  });

  const displayLastSaved = autoSaveLastSaved ?? lastSaved;
  const [pendingInitialContent, setPendingInitialContent] = useState<string | null>(null);

  usePageEditorEffects({
    isNewPage,
    currentPageId,
    isInitialized,
    isError,
    page,
    title,
    content,
    isWikiGenerating,
    wikiStatus,
    throttledTiptapContent,
    navigate,
    location,
    initialize,
    setContent,
    setSourceUrl,
    setPendingInitialContent,
    getTiptapContent,
    saveChanges,
    resetWiki,
    updatePageMutation,
    toast,
  });

  return {
    isLoading,
    isInitialized,
    isNewPage,
    pageId,
    title,
    content,
    sourceUrl,
    currentPageId,
    displayLastSaved,
    wikiStatus,
    isWikiGenerating,
    isSyncingLinks,
    isLocalDocEnabled,
    collaboration,
    duplicatePage,
    errorMessage,
    contentError,
    pendingInitialContent,
    setPendingInitialContent,
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
    wikiError,
    cancelWiki,
    resetWiki,
    setTitle,
    setContent,
    setContentError,
    validateTitle,
    saveChanges,
    generateWiki,
    location,
    handleExportMarkdown,
    handleCopyMarkdown,
  };
}
