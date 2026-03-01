import React from "react";
import { PageEditorHeader } from "./PageEditorHeader";
import { PageEditorAlerts } from "./PageEditorAlerts";
import { PageEditorContent } from "./PageEditorContent";
import { PageEditorDialogs } from "./PageEditorDialogs";
import { ContentWithAIChat } from "../../ai-chat/ContentWithAIChat";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import type { Page } from "@/types/page";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { WikiGeneratorStatus } from "./types";

export interface PageEditorLayoutProps {
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
  collaboration: UseCollaborationReturn | undefined;
  duplicatePage: Page | null;
  errorMessage: string | null;
  contentError: ContentError | null;
  pendingInitialContent: string | null;
  onBack: () => void;
  onDelete: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  onGenerateWiki: () => void;
  onOpenDuplicatePage: () => void;
  onCancelWiki: () => void;
  onContentChange: (content: string) => void;
  onContentError: (error: ContentError | null) => void;
  onTitleChange: (title: string) => void;
  onPendingInitialContentClear: () => void;
  deleteConfirmOpen: boolean;
  deleteReason: string;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  wikiErrorMessage: string | null;
  onResetWiki: () => void;
  onGoToAISettings: () => void;
}

export const PageEditorLayout: React.FC<PageEditorLayoutProps> = (props) => {
  const {
    title,
    content,
    sourceUrl,
    currentPageId,
    pageId,
    isNewPage,
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
    onBack,
    onDelete,
    onExportMarkdown,
    onCopyMarkdown,
    onGenerateWiki,
    onOpenDuplicatePage,
    onCancelWiki,
    onContentChange,
    onContentError,
    onTitleChange,
    onPendingInitialContentClear,
    deleteConfirmOpen,
    deleteReason,
    onDeleteConfirmOpenChange,
    onConfirmDelete,
    onCancelDelete,
    wikiErrorMessage,
    onResetWiki,
    onGoToAISettings,
  } = props;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PageEditorHeader
        lastSaved={displayLastSaved}
        onBack={onBack}
        onDelete={onDelete}
        onExportMarkdown={onExportMarkdown}
        onCopyMarkdown={onCopyMarkdown}
        collaboration={undefined}
      />

      <ContentWithAIChat>
        <PageEditorAlerts
          duplicatePage={duplicatePage}
          errorMessage={errorMessage}
          title={title}
          onOpenDuplicatePage={onOpenDuplicatePage}
          isWikiGenerating={isWikiGenerating}
          onCancelWiki={onCancelWiki}
          contentError={contentError}
        />

        <PageEditorContent
          content={content}
          title={title}
          sourceUrl={sourceUrl}
          currentPageId={currentPageId}
          pageId={pageId}
          isNewPage={isNewPage}
          isWikiGenerating={isWikiGenerating}
          isSyncingLinks={isSyncingLinks}
          onContentChange={onContentChange}
          onContentError={onContentError}
          onTitleChange={onTitleChange}
          errorMessage={errorMessage}
          collaboration={isLocalDocEnabled ? collaboration : undefined}
          wikiStatus={wikiStatus}
          onGenerateWiki={onGenerateWiki}
          initialContent={pendingInitialContent ?? undefined}
          onInitialContentApplied={() => {
            collaboration?.flushSave?.();
            onPendingInitialContentClear();
          }}
        />
      </ContentWithAIChat>

      <PageEditorDialogs
        deleteConfirmOpen={deleteConfirmOpen}
        deleteReason={deleteReason}
        onDeleteConfirmOpenChange={onDeleteConfirmOpenChange}
        onConfirmDelete={onConfirmDelete}
        onCancelDelete={onCancelDelete}
        wikiStatus={wikiStatus}
        wikiErrorMessage={wikiErrorMessage}
        onResetWiki={onResetWiki}
        onGoToAISettings={onGoToAISettings}
      />
    </div>
  );
};
