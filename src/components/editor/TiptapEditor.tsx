import React from "react";
import { useTranslation } from "react-i18next";
import { EditorContent } from "@tiptap/react";
import { cn } from "@zedi/ui";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { StorageSetupDialog } from "./TiptapEditor/StorageSetupDialog";
import { DragOverlay } from "./TiptapEditor/DragOverlay";
import { WikiLinkSuggestionLayer } from "./TiptapEditor/WikiLinkSuggestionLayer";
import { WikiLinkHoverCardLayer } from "./TiptapEditor/WikiLinkHoverCardLayer";
import { TagSuggestionLayer } from "./TiptapEditor/TagSuggestionLayer";
import { SlashSuggestionLayer } from "./TiptapEditor/SlashSuggestionLayer";
import { EditorBubbleMenu } from "./TiptapEditor/EditorBubbleMenu";
import { TableBubbleMenu } from "./TiptapEditor/TableBubbleMenu";
import { EditorRecommendationBar } from "@/components/editor/TiptapEditor/EditorRecommendationBar";
import { useTiptapEditorController } from "./TiptapEditor/useTiptapEditorController";
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
  initialContent,
  onInitialContentApplied,
  isWikiGenerating = false,
  wikiContentForCollab,
  onWikiContentApplied,
  pageNoteId = null,
}) => {
  const { t } = useTranslation();
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
    hasThumbnail,
    handleInsertThumbnailImage,
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
    initialContent,
    onInitialContentApplied,
    isWikiGenerating,
    wikiContentForCollab,
    onWikiContentApplied,
    pageNoteId,
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
          <EditorBubbleMenu editor={editor} pageId={pageId} />
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
      {showToolbar && (
        <EditorRecommendationBar
          pageTitle={pageTitle}
          isReadOnly={isReadOnly}
          hasThumbnail={hasThumbnail}
          onSelectThumbnail={handleInsertThumbnailImage}
        />
      )}
      <StorageSetupDialog
        open={storageSetupDialogOpen}
        onOpenChange={setStorageSetupDialogOpen}
        onConfirm={handleGoToStorageSettings}
      />
    </div>
  );
};

export default TiptapEditor;
