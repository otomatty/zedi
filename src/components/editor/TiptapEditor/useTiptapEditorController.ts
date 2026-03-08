import { useCallback, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useWikiLinkNavigation } from "./useWikiLinkNavigation";
import { useImageUploadManager } from "./useImageUploadManager";
import { useEditorSetup } from "./useEditorSetup";
import { useSuggestionEffects } from "./useSuggestionEffects";
import { useEditorLifecycle } from "./useEditorLifecycle";
import { useTiptapEditorStorageFeatures, useThumbnailController } from "./useTiptapEditorStorage";
import { isSameSlashSuggestionState, isSameWikiLinkSuggestionState } from "./suggestionStateUtils";
import type { TiptapEditorProps } from "./types";

function useSuggestionControllers() {
  const [suggestionState, setSuggestionState] = useState<WikiLinkSuggestionState | null>(null);
  const [slashState, setSlashState] = useState<SlashSuggestionState | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);
  const slashRef = useRef<SlashSuggestionHandle>(null);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState((prev) => (isSameWikiLinkSuggestionState(prev, state) ? prev : state));
  }, []);
  const handleSlashStateChange = useCallback((state: SlashSuggestionState) => {
    setSlashState((prev) => (isSameSlashSuggestionState(prev, state) ? prev : state));
  }, []);

  return {
    suggestionState,
    slashState,
    suggestionRef,
    slashRef,
    handleStateChange,
    handleSlashStateChange,
  };
}

function useImageUploadController(args: {
  editorRef: MutableRefObject<Editor | null>;
  onChange: TiptapEditorProps["onChange"];
  isReadOnly: boolean;
  isStorageConfigured: boolean;
  isStorageLoading: boolean;
  storageSettings: ReturnType<typeof useTiptapEditorStorageFeatures>["storageSettings"];
  toast: ReturnType<typeof useTiptapEditorStorageFeatures>["toast"];
  openStorageSetupDialog: () => void;
  lastSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
}) {
  return useImageUploadManager({
    editorRef: args.editorRef,
    onChange: args.onChange,
    isReadOnly: args.isReadOnly,
    isStorageConfigured: args.isStorageConfigured,
    isStorageLoading: args.isStorageLoading,
    storageSettings: args.storageSettings,
    toast: args.toast,
    onRequestStorageSetup: args.openStorageSetupDialog,
    lastSelectionRef: args.lastSelectionRef,
  });
}

function useEditorControllers(args: {
  content: string;
  onChange: TiptapEditorProps["onChange"];
  placeholder: string;
  autoFocus: boolean;
  pageId: string;
  isReadOnly: boolean;
  onContentError: TiptapEditorProps["onContentError"];
  collaborationConfig: TiptapEditorProps["collaborationConfig"];
  focusContentRef: TiptapEditorProps["focusContentRef"];
  initialContent: TiptapEditorProps["initialContent"];
  onInitialContentApplied: TiptapEditorProps["onInitialContentApplied"];
  isWikiGenerating: boolean;
  editorRef: MutableRefObject<Editor | null>;
  lastSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  editorContainerRef: RefObject<HTMLDivElement | null>;
  handleLinkClick: (title: string) => void;
  handleStateChange: (state: WikiLinkSuggestionState) => void;
  handleSlashStateChange: (state: SlashSuggestionState) => void;
  handleRetryUpload: (nodeId: string) => void;
  handleRemoveUpload: (nodeId: string) => void;
  getProviderLabel: () => string;
  canDeleteFromStorage: (src: string) => boolean;
  handleDeleteFromStorage: (src: string) => Promise<void>;
  handleCopyImageUrl: (src: string) => void;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  suggestionRef: RefObject<WikiLinkSuggestionHandle | null>;
  slashRef: RefObject<SlashSuggestionHandle | null>;
  handleInsertImageClick: () => void;
  handleImageUpload: (files: File[]) => Promise<void>;
}) {
  const { editor, handleInsertMermaid, isEditorInitializedRef } = useEditorSetup({
    content: args.content,
    onChange: args.onChange,
    placeholder: args.placeholder,
    autoFocus: args.autoFocus,
    pageId: args.pageId,
    isReadOnly: args.isReadOnly,
    onContentError: args.onContentError,
    collaborationConfig: args.collaborationConfig,
    editorRef: args.editorRef,
    lastSelectionRef: args.lastSelectionRef,
    handleLinkClick: args.handleLinkClick,
    handleStateChange: args.handleStateChange,
    handleSlashStateChange: args.handleSlashStateChange,
    handleRetryUpload: args.handleRetryUpload,
    handleRemoveUpload: args.handleRemoveUpload,
    getProviderLabel: args.getProviderLabel,
    canDeleteFromStorage: args.canDeleteFromStorage,
    handleDeleteFromStorage: args.handleDeleteFromStorage,
    handleCopyImageUrl: args.handleCopyImageUrl,
    suggestionState: args.suggestionState,
    slashState: args.slashState,
    suggestionRef: args.suggestionRef,
    slashRef: args.slashRef,
  });

  const suggestionUi = useSuggestionEffects({
    editor,
    suggestionState: args.suggestionState,
    slashState: args.slashState,
    editorContainerRef: args.editorContainerRef,
    pageId: args.pageId,
    handleInsertImageClick: args.handleInsertImageClick,
  });

  useEditorLifecycle({
    editor,
    content: args.content,
    onChange: args.onChange,
    onContentError: args.onContentError,
    isReadOnly: args.isReadOnly,
    pageId: args.pageId,
    isWikiGenerating: args.isWikiGenerating,
    collaborationConfig: args.collaborationConfig,
    focusContentRef: args.focusContentRef,
    initialContent: args.initialContent,
    onInitialContentApplied: args.onInitialContentApplied,
    handleImageUpload: args.handleImageUpload,
    isEditorInitializedRef,
  });

  return { editor, handleInsertMermaid, ...suggestionUi };
}

export function useTiptapEditorController({
  content,
  onChange,
  placeholder = "思考を書き始める...",
  autoFocus = false,
  pageId,
  pageTitle = "",
  isReadOnly = false,
  onContentError,
  collaborationConfig,
  focusContentRef,
  initialContent,
  onInitialContentApplied,
  isWikiGenerating = false,
}: TiptapEditorProps) {
  const { editorFontSizePx } = useGeneralSettings();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const {
    storageSettings,
    isStorageLoading,
    storageSetupDialogOpen,
    setStorageSetupDialogOpen,
    openStorageSetupDialog,
    handleGoToStorageSettings,
    toast,
    isStorageConfigured,
    hasThumbnail,
    getProviderLabel,
    handleCopyImageUrl,
    canDeleteFromStorage,
    handleDeleteFromStorage,
  } = useTiptapEditorStorageFeatures(content);
  const suggestionControllers = useSuggestionControllers();
  const imageUpload = useImageUploadController({
    editorRef,
    onChange,
    isReadOnly,
    isStorageConfigured,
    isStorageLoading,
    storageSettings,
    toast,
    openStorageSetupDialog,
    lastSelectionRef,
  });
  const editorControllers = useEditorControllers({
    content,
    onChange,
    placeholder,
    autoFocus,
    pageId: pageId ?? "",
    isReadOnly,
    onContentError,
    collaborationConfig,
    focusContentRef,
    initialContent,
    onInitialContentApplied,
    isWikiGenerating,
    editorRef,
    lastSelectionRef,
    editorContainerRef,
    handleLinkClick,
    handleStateChange: suggestionControllers.handleStateChange,
    handleSlashStateChange: suggestionControllers.handleSlashStateChange,
    handleRetryUpload: imageUpload.handleRetryUpload,
    handleRemoveUpload: imageUpload.handleRemoveUpload,
    getProviderLabel,
    canDeleteFromStorage,
    handleDeleteFromStorage,
    handleCopyImageUrl,
    suggestionState: suggestionControllers.suggestionState,
    slashState: suggestionControllers.slashState,
    suggestionRef: suggestionControllers.suggestionRef,
    slashRef: suggestionControllers.slashRef,
    handleInsertImageClick: imageUpload.handleInsertImageClick,
    handleImageUpload: imageUpload.handleImageUpload,
  });
  const { handleInsertThumbnailImage } = useThumbnailController(
    editorRef,
    pageTitle,
    storageSettings,
  );

  return {
    editor: editorControllers.editor,
    editorFontSizePx,
    editorContainerRef,
    fileInputRef: imageUpload.fileInputRef,
    isDraggingOver: imageUpload.isDraggingOver,
    handleFileInputChange: imageUpload.handleFileInputChange,
    handleDragOver: imageUpload.handleDragOver,
    handleDragLeave: imageUpload.handleDragLeave,
    handleDrop: imageUpload.handleDrop,
    suggestionState: suggestionControllers.suggestionState,
    suggestionPos: editorControllers.suggestionPos,
    suggestionRef: suggestionControllers.suggestionRef,
    handleSuggestionSelect: editorControllers.handleSuggestionSelect,
    handleSuggestionClose: editorControllers.handleSuggestionClose,
    slashState: suggestionControllers.slashState,
    slashPos: editorControllers.slashPos,
    slashRef: suggestionControllers.slashRef,
    handleSlashClose: editorControllers.handleSlashClose,
    mermaidDialogOpen,
    setMermaidDialogOpen,
    handleInsertMermaid: editorControllers.handleInsertMermaid,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
    hasThumbnail,
    handleInsertThumbnailImage,
    storageSetupDialogOpen,
    setStorageSetupDialogOpen,
    handleGoToStorageSettings,
  };
}
