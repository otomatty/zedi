import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";
import type { WikiLinkGhostCompletionCandidate } from "../extensions/wikiLinkGhostCompletionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { TagSuggestionHandle } from "../extensions/TagSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import { useAuth } from "@/hooks/useAuth";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useWikiLinkCandidates } from "@/hooks/useWikiLinkCandidates";
import { useWikiLinkNavigation } from "./useWikiLinkNavigation";
import { useEditorSetup } from "./useEditorSetup";
import { useSuggestionEffects } from "./useSuggestionEffects";
import { useEditorLifecycle } from "./useEditorLifecycle";
import { useTiptapEditorStorageFeatures, useThumbnailController } from "./useTiptapEditorStorage";
import { useSuggestionControllers } from "./useSuggestionControllers";
import { useImageUploadController } from "./useImageUploadController";
import { useClaudeAgentSlashAvailability } from "./useClaudeAgentSlashAvailability";
import { useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";
import type { TiptapEditorProps } from "./types";
import type { PageActionContext } from "../PageActionHub/types";

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
  /** @see TiptapEditorProps.insertAtCursorRef */
  insertAtCursorRef: TiptapEditorProps["insertAtCursorRef"];
  initialContent: TiptapEditorProps["initialContent"];
  onInitialContentApplied: TiptapEditorProps["onInitialContentApplied"];
  isWikiGenerating: boolean;
  wikiContentForCollab: TiptapEditorProps["wikiContentForCollab"];
  onWikiContentApplied: TiptapEditorProps["onWikiContentApplied"];
  editorRef: MutableRefObject<Editor | null>;
  lastSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  editorContainerRef: RefObject<HTMLDivElement | null>;
  handleLinkClick: (title: string) => void;
  handleStateChange: (state: WikiLinkSuggestionState) => void;
  handleSlashStateChange: (state: SlashSuggestionState) => void;
  handleTagSuggestionStateChange: (state: TagSuggestionState) => void;
  handleRetryUpload: (nodeId: string) => void;
  handleRemoveUpload: (nodeId: string) => void;
  getProviderLabel: (providerId?: string | null) => string;
  canDeleteFromStorage: (providerId?: string | null) => boolean;
  handleDeleteFromStorage: (url: string, providerId?: string | null) => Promise<void>;
  handleCopyImageUrl: (src: string) => void;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  tagSuggestionState: TagSuggestionState | null;
  suggestionRef: RefObject<WikiLinkSuggestionHandle | null>;
  slashRef: RefObject<SlashSuggestionHandle | null>;
  tagSuggestionRef: RefObject<TagSuggestionHandle | null>;
  handleInsertImageClick: () => void;
  handleInsertCameraImageClick: () => void;
  handleImageUpload: (files: FileList | File[]) => void;
  /** Note-linked workspace root for `@file:` (Issue #461). */
  workspaceRoot: string | null;
  /** Note id for Tauri workspace registry (Issue #461). */
  noteId: string | null;
  /**
   * 編集中ページの noteId。WikiLink 存在確認のスコープに使用する
   * （Issue #713 Phase 4）。
   * Owning note ID of the page being edited; scopes WikiLink existence
   * checks (issue #713 Phase 4).
   */
  pageNoteId: string | null;
  /**
   * インライン・ゴースト補完（issue #930）に渡す候補一覧の getter。
   * `useTiptapEditorController` で `useWikiLinkCandidates(pageNoteId)` を
   * ref に保持し `() => ref.current` を渡す。
   *
   * Getter returning the latest candidate list for inline ghost completion
   * (issue #930). Held as a ref in `useTiptapEditorController` to avoid
   * editor re-creation on candidate updates.
   */
  getGhostCompletionCandidates: () => ReadonlyArray<WikiLinkGhostCompletionCandidate>;
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
    handleTagSuggestionStateChange: args.handleTagSuggestionStateChange,
    handleRetryUpload: args.handleRetryUpload,
    handleRemoveUpload: args.handleRemoveUpload,
    getProviderLabel: args.getProviderLabel,
    canDeleteFromStorage: args.canDeleteFromStorage,
    handleDeleteFromStorage: args.handleDeleteFromStorage,
    handleCopyImageUrl: args.handleCopyImageUrl,
    suggestionState: args.suggestionState,
    slashState: args.slashState,
    tagSuggestionState: args.tagSuggestionState,
    suggestionRef: args.suggestionRef,
    slashRef: args.slashRef,
    tagSuggestionRef: args.tagSuggestionRef,
    workspaceRoot: args.workspaceRoot,
    noteId: args.noteId,
    getGhostCompletionCandidates: args.getGhostCompletionCandidates,
  });

  const suggestionUi = useSuggestionEffects({
    editor,
    suggestionState: args.suggestionState,
    slashState: args.slashState,
    tagSuggestionState: args.tagSuggestionState,
    editorContainerRef: args.editorContainerRef,
    pageId: args.pageId,
    handleInsertImageClick: args.handleInsertImageClick,
    handleInsertCameraImageClick: args.handleInsertCameraImageClick,
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
    insertAtCursorRef: args.insertAtCursorRef,
    initialContent: args.initialContent,
    onInitialContentApplied: args.onInitialContentApplied,
    wikiContentForCollab: args.wikiContentForCollab,
    onWikiContentApplied: args.onWikiContentApplied,
    handleImageUpload: args.handleImageUpload,
    isEditorInitializedRef,
    pageNoteId: args.pageNoteId,
  });

  return { editor, handleInsertMermaid, ...suggestionUi };
}

/**
 * Tiptapエディタの統合コントローラ（エディタ設定・サジェスト・画像アップロード・ライフサイクルを管理）。
 * Unified controller for the Tiptap editor: setup, suggestions, image upload, and lifecycle management.
 */
export function useTiptapEditorController({
  content,
  onChange,
  placeholder,
  autoFocus = false,
  pageId,
  pageTitle = "",
  isReadOnly = false,
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
}: TiptapEditorProps) {
  const { editorFontSizePx } = useGeneralSettings();
  const { isSignedIn } = useAuth();
  const noteWorkspace = useNoteWorkspaceOptional();
  const workspaceRoot = noteWorkspace?.workspaceRoot ?? null;
  const noteIdForWorkspace = noteWorkspace?.noteId ?? null;
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation({ pageNoteId });
  // Inline ghost completion (issue #930): keep the latest candidate list in a
  // ref so the ProseMirror plugin can read it on every transaction without
  // forcing `useEditor` to re-run when candidates change.
  // インライン・ゴースト補完（issue #930）の候補一覧を ref に保持。
  // 候補更新で `useEditor` が再実行されないように getter 経由で渡す。
  const { pages: ghostCompletionCandidates } = useWikiLinkCandidates(pageNoteId);
  const ghostCompletionCandidatesRef =
    useRef<ReadonlyArray<WikiLinkGhostCompletionCandidate>>(ghostCompletionCandidates);
  useEffect(() => {
    ghostCompletionCandidatesRef.current = ghostCompletionCandidates;
  }, [ghostCompletionCandidates]);
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
  const [slashAgentBusy, setSlashAgentBusy] = useState(false);
  const claudeAgentSlashAvailable = useClaudeAgentSlashAvailability();
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
    placeholder: placeholder ?? "",
    autoFocus,
    pageId: pageId ?? "",
    isReadOnly,
    onContentError,
    collaborationConfig,
    focusContentRef,
    insertAtCursorRef,
    initialContent,
    onInitialContentApplied,
    isWikiGenerating,
    wikiContentForCollab: wikiContentForCollab ?? null,
    onWikiContentApplied,
    editorRef,
    lastSelectionRef,
    editorContainerRef,
    handleLinkClick,
    handleStateChange: suggestionControllers.handleStateChange,
    handleSlashStateChange: suggestionControllers.handleSlashStateChange,
    handleTagSuggestionStateChange: suggestionControllers.handleTagSuggestionStateChange,
    handleRetryUpload: imageUpload.handleRetryUpload,
    handleRemoveUpload: imageUpload.handleRemoveUpload,
    getProviderLabel,
    canDeleteFromStorage,
    handleDeleteFromStorage,
    handleCopyImageUrl,
    suggestionState: suggestionControllers.suggestionState,
    slashState: suggestionControllers.slashState,
    tagSuggestionState: suggestionControllers.tagSuggestionState,
    suggestionRef: suggestionControllers.suggestionRef,
    slashRef: suggestionControllers.slashRef,
    tagSuggestionRef: suggestionControllers.tagSuggestionRef,
    handleInsertImageClick: imageUpload.handleInsertImageClick,
    handleInsertCameraImageClick: imageUpload.handleInsertCameraImageClick,
    handleImageUpload: imageUpload.handleImageUpload,
    workspaceRoot,
    noteId: noteIdForWorkspace,
    pageNoteId,
    getGhostCompletionCandidates: () => ghostCompletionCandidatesRef.current,
  });
  const { handleInsertThumbnailImage } = useThumbnailController(
    editorRef,
    pageTitle,
    storageSettings,
  );

  // PageActionHub に渡すコンテキスト。レジストリゲートと各アクションが参照する。
  // Context object passed to PageActionHub; consumed by registry gates and actions.
  const pageActionContext: PageActionContext = useMemo(
    () => ({
      pageTitle,
      isReadOnly,
      isSignedIn,
      hasThumbnail,
      insertThumbnail: handleInsertThumbnailImage,
      wikiComposeHref,
    }),
    [pageTitle, isReadOnly, isSignedIn, hasThumbnail, handleInsertThumbnailImage, wikiComposeHref],
  );

  return {
    editor: editorControllers.editor,
    editorFontSizePx,
    editorContainerRef,
    handleLinkClick,
    fileInputRef: imageUpload.fileInputRef,
    cameraInputRef: imageUpload.cameraInputRef,
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
    tagSuggestionState: suggestionControllers.tagSuggestionState,
    tagSuggestionPos: editorControllers.tagSuggestionPos,
    tagSuggestionRef: suggestionControllers.tagSuggestionRef,
    handleTagSuggestionSelect: editorControllers.handleTagSuggestionSelect,
    handleTagSuggestionClose: editorControllers.handleTagSuggestionClose,
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
    slashAgentBusy,
    claudeAgentSlashAvailable,
    onSlashAgentBusyChange: setSlashAgentBusy,
    claudeWorkspaceRoot: noteWorkspace?.workspaceRoot ?? null,
    claudeWorkspaceNoteId: noteWorkspace?.noteId ?? null,
    pageNoteId,
    pageActionHubRef,
    pageActionContext,
  };
}
