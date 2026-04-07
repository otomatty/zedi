import React, { useState, useCallback } from "react";
import { PageEditorHeader } from "./PageEditorHeader";
import { PageEditorAlerts } from "./PageEditorAlerts";
import { PageEditorContent } from "./PageEditorContent";
import { PageEditorDialogs } from "./PageEditorDialogs";
import { ContentWithAIChat } from "../../ai-chat/ContentWithAIChat";
import { PageHistoryModal } from "../pageHistory/PageHistoryModal";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import type { Page } from "@/types/page";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { WikiGeneratorStatus } from "./types";

/**
 * PageEditorLayout コンポーネントの Props。
 * Props for the PageEditorLayout component.
 */
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
  /** コラボモード時、Wiki生成内容を Y.Doc に反映する用。反映後に onWikiContentApplied でクリア */
  wikiContentForCollab: string | null;
  onWikiContentApplied: () => void;
}

/**
 * ページエディタのレイアウトコンポーネント（ヘッダー・アラート・エディタ・ダイアログを統合）。
 * Page editor layout component integrating header, alerts, editor content, and dialogs.
 */
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
    wikiContentForCollab,
    onWikiContentApplied,
  } = props;

  const [historyOpen, setHistoryOpen] = useState(false);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  const handleRestored = useCallback(() => {
    // 復元後にページをリロードして最新状態を反映する
    // Reload the page after restore to reflect the latest state
    window.location.reload();
  }, []);

  // React Compiler が optional chain の依存を保持できないため先に抽出する
  // Extract ydoc to avoid React Compiler memoization issue with optional chaining
  const ydoc = collaboration?.ydoc ?? null;

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <PageEditorHeader
        lastSaved={displayLastSaved}
        onBack={onBack}
        onDelete={onDelete}
        onExportMarkdown={onExportMarkdown}
        onCopyMarkdown={onCopyMarkdown}
        onOpenHistory={handleOpenHistory}
        collaboration={undefined}
      />

      <ContentWithAIChat useLocalPanel>
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
          wikiContentForCollab={wikiContentForCollab}
          onWikiContentApplied={onWikiContentApplied}
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

      {historyOpen && (
        <PageHistoryModal
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          pageId={pageId}
          currentYdoc={ydoc}
          onRestored={handleRestored}
        />
      )}
    </div>
  );
};
