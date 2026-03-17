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
import { usePageEditorWikiCollab } from "./usePageEditorWikiCollab";
import { usePageDeletion } from "./usePageDeletion";
import { useMarkdownExport } from "./useMarkdownExport";
import { usePageEditorKeyboard } from "./usePageEditorKeyboard";

function useDisplayLastSavedAndPending(
  autoSaveLastSaved: number | null | undefined,
  lastSaved: number | null,
) {
  const [pendingInitialContent, setPendingInitialContent] = useState<string | null>(null);
  const displayLastSaved = autoSaveLastSaved ?? lastSaved;
  return { displayLastSaved, pendingInitialContent, setPendingInitialContent };
}

function usePageEditorDeletionAndNav(
  currentPageId: string | null,
  title: string,
  content: string,
  sourceUrl: string,
  shouldBlockSave: boolean,
) {
  const deletion = usePageDeletion({
    currentPageId,
    title,
    content,
    shouldBlockSave,
  });
  const { handleExportMarkdown, handleCopyMarkdown } = useMarkdownExport(title, content, sourceUrl);
  usePageEditorKeyboard({ onBack: deletion.handleBack });
  return { ...deletion, handleExportMarkdown, handleCopyMarkdown };
}

/**
 * ページエディタの状態管理・自動保存・副作用を統合するフック。
 * Integrates page editor state management, auto-save, and side effects.
 */
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
    reset: resetWikiBase,
    throttledTiptapContent,
    getTiptapContent,
  } = useWikiGenerator();

  const isWikiGenerating = wikiStatus === "generating";

  const { wikiContentForCollab, setWikiContentForCollab, resetWiki, onWikiContentApplied } =
    usePageEditorWikiCollab(resetWikiBase, collaboration);

  const {
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
    handleExportMarkdown,
    handleCopyMarkdown,
  } = usePageEditorDeletionAndNav(currentPageId, title, content, sourceUrl, shouldBlockSave);

  const {
    saveChanges,
    lastSaved: autoSaveLastSaved,
    isSyncingLinks,
  } = usePageEditorAutoSaveWithMutation({
    currentPageId,
    shouldBlockSave,
    updateLastSaved,
  });

  const { displayLastSaved, pendingInitialContent, setPendingInitialContent } =
    useDisplayLastSavedAndPending(autoSaveLastSaved, lastSaved);

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
    setWikiContentForCollab,
    setSourceUrl,
    setPendingInitialContent,
    getTiptapContent,
    saveChanges,
    resetWiki,
    resetWikiBase,
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
    wikiContentForCollab,
    onWikiContentApplied,
  };
}
