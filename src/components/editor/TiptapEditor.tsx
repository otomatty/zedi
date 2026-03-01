import React, { useState, useCallback, useMemo, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import { cn } from "@/lib/utils";
import type { WikiLinkSuggestionState } from "./extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "./extensions/slashSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "./extensions/WikiLinkSuggestion";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { useWikiLinkNavigation } from "./TiptapEditor/useWikiLinkNavigation";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { getStorageProviderById } from "@/types/storage";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { isStorageConfiguredForUpload, getSettingsForUpload } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { StorageSetupDialog } from "./TiptapEditor/StorageSetupDialog";
import { DragOverlay } from "./TiptapEditor/DragOverlay";
import { WikiLinkSuggestionLayer } from "./TiptapEditor/WikiLinkSuggestionLayer";
import {
  SlashSuggestionLayer,
  type SlashSuggestionHandle,
} from "./TiptapEditor/SlashSuggestionLayer";
import { EditorBubbleMenu } from "./TiptapEditor/EditorBubbleMenu";
import { TableBubbleMenu } from "./TiptapEditor/TableBubbleMenu";
import { useImageUploadManager } from "./TiptapEditor/useImageUploadManager";
import { useStorageActions } from "./TiptapEditor/useStorageActions";
import { EditorRecommendationBar } from "@/components/editor/TiptapEditor/EditorRecommendationBar";
import { extractFirstImage } from "@/lib/contentUtils";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useEditorSetup } from "./TiptapEditor/useEditorSetup";
import { useEditorLifecycle } from "./TiptapEditor/useEditorLifecycle";
import { useSuggestionEffects } from "./TiptapEditor/useSuggestionEffects";
import { useThumbnailCommit } from "./TiptapEditor/useThumbnailCommit";

// Re-export types for consumers
export type { ContentError } from "./TiptapEditor/useContentSanitizer";
export type { TiptapEditorProps } from "./TiptapEditor/types";

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
}) => {
  const { editorFontSizePx } = useGeneralSettings();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();

  const [suggestionState, setSuggestionState] = useState<WikiLinkSuggestionState | null>(null);
  const [slashState, setSlashState] = useState<SlashSuggestionState | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);
  const slashRef = useRef<SlashSuggestionHandle>(null);
  const handleStateChange = useCallback((s: WikiLinkSuggestionState) => setSuggestionState(s), []);
  const handleSlashStateChange = useCallback((s: SlashSuggestionState) => setSlashState(s), []);

  const { settings: storageSettings, isLoading: isStorageLoading } = useStorageSettings();
  const isStorageConfigured = !isStorageLoading && isStorageConfiguredForUpload(storageSettings);
  const currentStorageProvider = getStorageProviderById(
    getSettingsForUpload(storageSettings).provider,
  );
  const [storageSetupDialogOpen, setStorageSetupDialogOpen] = useState(false);
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const hasThumbnail = useMemo(() => Boolean(extractFirstImage(content)), [content]);

  const { getProviderLabel, handleCopyImageUrl, canDeleteFromStorage, handleDeleteFromStorage } =
    useStorageActions({ storageSettings, isStorageConfigured, currentStorageProvider, toast });
  const openStorageSetupDialog = useCallback(() => setStorageSetupDialogOpen(true), []);

  const {
    fileInputRef,
    isDraggingOver,
    handleFileInputChange,
    handleInsertImageClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRetryUpload,
    handleRemoveUpload,
    handleImageUpload,
  } = useImageUploadManager({
    editorRef,
    onChange,
    isReadOnly,
    isStorageConfigured,
    isStorageLoading,
    storageSettings,
    toast,
    onRequestStorageSetup: openStorageSetupDialog,
    lastSelectionRef,
  });

  const { editor, handleInsertMermaid, isEditorInitializedRef } = useEditorSetup({
    content,
    onChange,
    placeholder,
    autoFocus,
    pageId: pageId ?? "",
    isReadOnly,
    onContentError,
    collaborationConfig,
    editorRef,
    lastSelectionRef,
    handleLinkClick,
    handleStateChange,
    handleSlashStateChange,
    handleRetryUpload,
    handleRemoveUpload,
    getProviderLabel,
    canDeleteFromStorage,
    handleDeleteFromStorage,
    handleCopyImageUrl,
    suggestionState,
    slashState,
    suggestionRef,
    slashRef,
  });

  const {
    suggestionPos,
    slashPos,
    handleSuggestionSelect,
    handleSuggestionClose,
    handleSlashClose,
  } = useSuggestionEffects({
    editor,
    suggestionState,
    slashState,
    editorContainerRef,
    pageId: pageId ?? "",
    handleInsertImageClick,
  });

  useEditorLifecycle({
    editor,
    content,
    onChange,
    onContentError,
    isReadOnly,
    pageId: pageId ?? "",
    isWikiGenerating,
    collaborationConfig,
    focusContentRef,
    initialContent,
    onInitialContentApplied,
    handleImageUpload,
    isEditorInitializedRef,
  });

  const { handleInsertThumbnailImage } = useThumbnailCommit({
    editorRef,
    pageTitle,
    storageSettings,
  });

  const handleGoToStorageSettings = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/settings/storage?${new URLSearchParams({ returnTo }).toString()}`);
  }, [navigate, location.pathname, location.search]);

  return (
    <div
      ref={editorContainerRef}
      className={cn("relative", className, isDraggingOver && "ring-dashed ring-2 ring-primary")}
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
          <EditorBubbleMenu editor={editor} />
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
