import React from "react";
import { EditorContent } from "@tiptap/react";
import { cn } from "@zedi/ui";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { StorageSetupDialog } from "./TiptapEditor/StorageSetupDialog";
import { DragOverlay } from "./TiptapEditor/DragOverlay";
import { WikiLinkSuggestionLayer } from "./TiptapEditor/WikiLinkSuggestionLayer";
import { SlashSuggestionLayer } from "./TiptapEditor/SlashSuggestionLayer";
import { EditorBubbleMenu } from "./TiptapEditor/EditorBubbleMenu";
import { TableBubbleMenu } from "./TiptapEditor/TableBubbleMenu";
import { EditorRecommendationBar } from "@/components/editor/TiptapEditor/EditorRecommendationBar";
import { useTiptapEditorController } from "./TiptapEditor/useTiptapEditorController";

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
  placeholder = "思考を書き始める...",
  className,
  autoFocus = false,
  pageId,
  pageTitle = "",
  isReadOnly = false,
  showToolbar = true,
  onContentError,
  collaborationConfig,
  focusContentRef,
  initialContent,
  onInitialContentApplied,
  isWikiGenerating = false,
  wikiContentForCollab,
  onWikiContentApplied,
}) => {
  const {
    editor,
    editorFontSizePx,
    editorContainerRef,
    fileInputRef,
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
  } = useTiptapEditorController({
    content,
    onChange,
    placeholder,
    autoFocus,
    pageId,
    pageTitle,
    isReadOnly,
    collaborationConfig,
    onContentError,
    focusContentRef,
    initialContent,
    onInitialContentApplied,
    isWikiGenerating,
    wikiContentForCollab,
    onWikiContentApplied,
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
      />
      {!isReadOnly && (
        <SlashSuggestionLayer
          editor={editor}
          suggestionState={slashState}
          position={slashPos}
          suggestionRef={slashRef}
          onClose={handleSlashClose}
        />
      )}
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
