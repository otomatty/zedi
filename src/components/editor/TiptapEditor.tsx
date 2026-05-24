import React, { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent } from "@tiptap/react";
import { cn, useIsMobile } from "@zedi/ui";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { StorageSetupDialog } from "./TiptapEditor/StorageSetupDialog";
import { DragOverlay } from "./TiptapEditor/DragOverlay";
import { WikiLinkSuggestionLayer } from "./TiptapEditor/WikiLinkSuggestionLayer";
import { FloatingWikiLinkInputBar } from "./FloatingWikiLinkInputBar";
import { WikiLinkHoverCardLayer } from "./TiptapEditor/WikiLinkHoverCardLayer";
import { TagSuggestionLayer } from "./TiptapEditor/TagSuggestionLayer";
import { SlashSuggestionLayer } from "./TiptapEditor/SlashSuggestionLayer";
import { EditorBubbleMenu } from "./TiptapEditor/EditorBubbleMenu";
import { MobileSelectionSheet } from "./TiptapEditor/MobileSelectionSheet";
import { TableBubbleMenu } from "./TiptapEditor/TableBubbleMenu";
import { PageActionHub } from "@/components/editor/PageActionHub/PageActionHub";
import { useTiptapEditorController } from "./TiptapEditor/useTiptapEditorController";
import { useBubbleMenuWikiLink } from "./TiptapEditor/useBubbleMenuWikiLink";
import { useEditorWikiLinkShortcuts } from "@/hooks/useEditorWikiLinkShortcuts";
import { SlashAgentLoadingOverlay } from "./TiptapEditor/SlashAgentLoadingOverlay";

// Re-export types for consumers
export type { ContentError } from "./TiptapEditor/useContentSanitizer";
export type { TiptapEditorProps } from "./TiptapEditor/types";

/**
 * Tiptap を用いたページエディタ UI。
 * Page editor UI using Tiptap.
 */
const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  onChange,
  placeholder,
  className,
  autoFocus = false,
  pageId,
  pageTitle = "",
  isReadOnly = false,
  showToolbar = true,
  onContentError,
  collaborationConfig,
  focusContentRef,
  insertAtCursorRef,
  pageActionHubRef,
  initialContent,
  onInitialContentApplied,
  isWikiGenerating = false,
  wikiContentForCollab,
  onWikiContentApplied,
  pageNoteId = null,
  wikiComposeHref,
  bottomBarTrailingAction,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const resolvedPlaceholder = placeholder ?? t("editor.startWritingPlaceholder");
  const {
    editor,
    editorFontSizePx,
    editorContainerRef,
    handleLinkClick,
    fileInputRef,
    cameraInputRef,
    isDraggingOver,
    handleFileInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    suggestionState,
    suggestionPos,
    suggestionRef,
    handleSuggestionSelect,
    handleSuggestionClose,
    slashState,
    slashPos,
    slashRef,
    handleSlashClose,
    tagSuggestionState,
    tagSuggestionPos,
    tagSuggestionRef,
    handleTagSuggestionSelect,
    handleTagSuggestionClose,
    mermaidDialogOpen,
    setMermaidDialogOpen,
    handleInsertMermaid,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
    pageActionContext,
    storageSetupDialogOpen,
    setStorageSetupDialogOpen,
    handleGoToStorageSettings,
    slashAgentBusy,
    claudeAgentSlashAvailable,
    onSlashAgentBusyChange,
    claudeWorkspaceRoot,
    claudeWorkspaceNoteId,
    pageNoteId: resolvedPageNoteId,
  } = useTiptapEditorController({
    content,
    onChange,
    placeholder: resolvedPlaceholder,
    autoFocus,
    pageId,
    pageTitle,
    isReadOnly,
    collaborationConfig,
    onContentError,
    focusContentRef,
    insertAtCursorRef,
    pageActionHubRef,
    initialContent,
    onInitialContentApplied,
    isWikiGenerating,
    wikiContentForCollab,
    onWikiContentApplied,
    pageNoteId,
    wikiComposeHref,
  });

  // 入力バーへフォーカスを移すための imperative ハンドル（issue #928 §Cmd+K）。
  // 入力バー側の `useEffect` がここに focus 関数を割り当てる。
  // Imperative handle that the bar populates with a focus function (issue
  // #928 / Cmd+K).
  const focusInputBarRef = useRef<(() => void) | null>(null);

  // `Cmd/Ctrl+Shift+L` の実体。既存のバブルメニュー実装をそのまま再利用し、
  // 「選択範囲を Wiki Link 化」操作のロジックを 1 箇所に集約する。
  // Cmd/Ctrl+Shift+L is wired to the existing bubble-menu conversion so the
  // "selection → wiki link" logic lives in a single place.
  const { convertToWikiLink } = useBubbleMenuWikiLink({ editor, pageId });
  const focusInputBar = useCallback(() => {
    focusInputBarRef.current?.();
  }, []);
  useEditorWikiLinkShortcuts({
    editor,
    focusInputBar,
    convertSelectionToWikiLink: convertToWikiLink,
    isReadOnly,
  });

  return (
    <div
      ref={editorContainerRef}
      className={cn("relative", className, isDraggingOver && "ring-dashed ring-primary ring-2")}
      style={{ "--editor-font-size": `${editorFontSizePx}px` } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <EditorContent editor={editor} />
      {editor && !isReadOnly && (
        <>
          {/*
            BubbleMenu はモバイルでは仮想キーボードと干渉するため非表示にし、
            代わりにキーボード直上のシート (MobileSelectionSheet) で同等の
            装飾アクションを提供する（issue #924 §2 / #929）。
            The bubble menu collides with the on-screen keyboard on phones,
            so we hide it on mobile and route the same actions through the
            keyboard-aware sheet instead (issue #924 §2 / #929).
          */}
          {!isMobile && <EditorBubbleMenu editor={editor} pageId={pageId} />}
          {isMobile && <MobileSelectionSheet editor={editor} pageId={pageId} />}
          <TableBubbleMenu editor={editor} />
        </>
      )}
      <DragOverlay isVisible={isDraggingOver} />
      <WikiLinkSuggestionLayer
        editor={editor}
        suggestionState={suggestionState}
        position={suggestionPos}
        suggestionRef={suggestionRef}
        onSelect={handleSuggestionSelect}
        onClose={handleSuggestionClose}
        pageNoteId={resolvedPageNoteId}
      />
      <TagSuggestionLayer
        editor={editor}
        suggestionState={tagSuggestionState}
        position={tagSuggestionPos}
        suggestionRef={tagSuggestionRef}
        onSelect={handleTagSuggestionSelect}
        onClose={handleTagSuggestionClose}
        pageNoteId={resolvedPageNoteId}
      />
      <WikiLinkHoverCardLayer
        editor={editor}
        editorContainerRef={editorContainerRef}
        onLinkClick={handleLinkClick}
      />
      {!isReadOnly && (
        <SlashSuggestionLayer
          editor={editor}
          suggestionState={slashState}
          position={slashPos}
          suggestionRef={slashRef}
          onClose={handleSlashClose}
          claudeAgentSlashAvailable={claudeAgentSlashAvailable}
          onAgentBusyChange={onSlashAgentBusyChange}
          claudeWorkspaceRoot={claudeWorkspaceRoot}
          claudeWorkspaceNoteId={claudeWorkspaceNoteId}
        />
      )}
      {slashAgentBusy ? <SlashAgentLoadingOverlay label={t("editor.slashAgentRunning")} /> : null}
      <MermaidGeneratorDialog
        open={mermaidDialogOpen}
        onOpenChange={setMermaidDialogOpen}
        selectedText=""
        onInsert={handleInsertMermaid}
      />
      <CreatePageDialog
        open={createPageDialogOpen}
        pageTitle={pendingCreatePageTitle}
        onConfirm={handleConfirmCreate}
        onCancel={handleCancelCreate}
      />
      {showToolbar && <PageActionHub ctx={pageActionContext} hubRef={pageActionHubRef} />}
      <StorageSetupDialog
        open={storageSetupDialogOpen}
        onOpenChange={setStorageSetupDialogOpen}
        onConfirm={handleGoToStorageSettings}
      />
      {!isReadOnly && (
        // FAB 左にピル型 Wiki Link 入力バーを常時表示する（issue #924 §2 / #926）。
        // 役割はゴーストリンク作成 + 入力中の既存ページ候補提示の二役 UI。
        // Always-on pill input bar mounted to the left of the FAB (issue
        // #924 §2 / #926). Doubles as ghost-link creation and existing-link
        // insertion via the shared suggestion popup.
        <FloatingWikiLinkInputBar
          editor={editor}
          pageId={pageId}
          pageNoteId={resolvedPageNoteId}
          focusInputBarRef={focusInputBarRef}
          trailingAction={bottomBarTrailingAction}
        />
      )}
    </div>
  );
};

export default TiptapEditor;
