import { usePageEditorStateAndSync } from "./usePageEditorStateAndSync";
import { usePageEditorHandlers } from "./usePageEditorHandlers";
import type { PageEditorLayoutProps } from "./PageEditorLayout";
import type { WikiGeneratorStatus } from "./types";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";

function buildLayoutProps(
  state: {
    title: string;
    content: string;
    sourceUrl: string | undefined;
    currentPageId: string | null;
    pageId: string;
    isNewPage: boolean;
    displayLastSaved: number | null;
    wikiStatus: WikiGeneratorStatus;
    isWikiGenerating: boolean;
    isSyncingLinks: boolean;
    isLocalDocEnabled: boolean;
    collaboration: ReturnType<typeof import("@/hooks/useCollaboration").useCollaboration>;
    duplicatePage: ReturnType<
      typeof import("@/hooks/useTitleValidation").useTitleValidation
    >["duplicatePage"];
    errorMessage: string | null;
    contentError: ContentError | null;
    pendingInitialContent: string | null;
    deleteConfirmOpen: boolean;
    deleteReason: string;
    wikiErrorMessage: string | null;
  },
  handlers: {
    onBack: () => void;
    onDelete: () => void;
    onExportMarkdown: () => void;
    onCopyMarkdown: () => void;
    onGenerateWiki: () => void;
    onOpenDuplicatePage: () => void;
    onCancelWiki: () => void;
    onContentChange: (content: string) => void;
    onContentError: (error: unknown) => void;
    onTitleChange: (title: string) => void;
    onPendingInitialContentClear: () => void;
    onDeleteConfirmOpenChange: (open: boolean) => void;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
    onResetWiki: () => void;
    onGoToAISettings: () => void;
  },
): PageEditorLayoutProps {
  return {
    ...state,
    duplicatePage: state.duplicatePage ?? null,
    ...handlers,
  };
}

export function usePageEditor() {
  const state = usePageEditorStateAndSync();
  const handlers = usePageEditorHandlers({
    title: state.title,
    content: state.content,
    duplicatePage: state.duplicatePage ?? null,
    setTitle: state.setTitle,
    setContent: state.setContent,
    setContentError: state.setContentError,
    validateTitle: state.validateTitle,
    saveChanges: state.saveChanges,
    generateWiki: state.generateWiki,
    resetWiki: state.resetWiki,
    location: state.location,
  });

  const showLoading =
    (!state.isNewPage && state.isLoading) || (state.isNewPage && !state.isInitialized);

  const layoutProps = buildLayoutProps(
    {
      title: state.title,
      content: state.content,
      sourceUrl: state.sourceUrl,
      currentPageId: state.currentPageId,
      pageId: state.pageId,
      isNewPage: state.isNewPage,
      displayLastSaved: state.displayLastSaved,
      wikiStatus: state.wikiStatus,
      isWikiGenerating: state.isWikiGenerating,
      isSyncingLinks: state.isSyncingLinks,
      isLocalDocEnabled: state.isLocalDocEnabled,
      collaboration: state.collaboration,
      duplicatePage: state.duplicatePage,
      errorMessage: state.errorMessage,
      contentError: state.contentError,
      pendingInitialContent: state.pendingInitialContent,
      deleteConfirmOpen: state.deleteConfirmOpen,
      deleteReason: state.deleteReason,
      wikiErrorMessage: state.wikiError?.message || null,
    },
    {
      onBack: state.handleBack,
      onDelete: state.handleDelete,
      onExportMarkdown: state.handleExportMarkdown,
      onCopyMarkdown: state.handleCopyMarkdown,
      onGenerateWiki: handlers.handleGenerateWiki,
      onOpenDuplicatePage: handlers.handleOpenDuplicatePage,
      onCancelWiki: state.cancelWiki,
      onContentChange: handlers.handleContentChange,
      onContentError: handlers.handleContentError,
      onTitleChange: handlers.handleTitleChange,
      onPendingInitialContentClear: () => state.setPendingInitialContent(null),
      onDeleteConfirmOpenChange: state.setDeleteConfirmOpen,
      onConfirmDelete: state.handleConfirmDelete,
      onCancelDelete: state.handleCancelDelete,
      onResetWiki: state.resetWiki,
      onGoToAISettings: handlers.handleGoToAISettings,
    },
  );

  return { showLoading, layoutProps };
}
