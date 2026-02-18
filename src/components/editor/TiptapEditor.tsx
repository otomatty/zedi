import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import { cn } from "@/lib/utils";
import {
  wikiLinkSuggestionPluginKey,
  type WikiLinkSuggestionState,
} from "./extensions/wikiLinkSuggestionPlugin";
import {
  slashSuggestionPluginKey,
  type SlashSuggestionState,
} from "./extensions/slashSuggestionPlugin";
import {
  type WikiLinkSuggestionHandle,
  type SuggestionItem,
} from "./extensions/WikiLinkSuggestion";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";
import { useContentSanitizer, type ContentError } from "./TiptapEditor/useContentSanitizer";
import { useWikiLinkNavigation } from "./TiptapEditor/useWikiLinkNavigation";
import { useWikiLinkStatusSync } from "./TiptapEditor/useWikiLinkStatusSync";
import { createEditorExtensions, defaultEditorProps } from "./TiptapEditor/editorConfig";
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
import { usePasteImageHandler } from "./TiptapEditor/usePasteImageHandler";
import { useStorageActions } from "./TiptapEditor/useStorageActions";
import { EditorBottomToolbar } from "@/components/editor/TiptapEditor/EditorBottomToolbar";
import { EditorRecommendationBar } from "@/components/editor/TiptapEditor/EditorRecommendationBar";
import { useAuth } from "@/hooks/useAuth";
import { extractFirstImage } from "@/lib/contentUtils";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";

/** Uses same base URL as REST API (VITE_ZEDI_API_BASE_URL). */
const getThumbnailApiBaseUrl = () => (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";

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
}) => {
  const { checkReferenced } = useCheckGhostLinkReferenced();
  const { editorFontSizePx } = useGeneralSettings();

  // WikiLink navigation hook
  const {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();

  const [suggestionState, setSuggestionState] =
    useState<WikiLinkSuggestionState | null>(null);
  const [suggestionPos, setSuggestionPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);

  // Slash command state
  const [slashState, setSlashState] = useState<SlashSuggestionState | null>(null);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const slashRef = useRef<SlashSuggestionHandle>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // Mermaid generator state
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const [selectedTextForMermaid, setSelectedTextForMermaid] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const hasThumbnail = useMemo(
    () => Boolean(extractFirstImage(content)),
    [content]
  );

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    settings: storageSettings,
    isLoading: isStorageLoading,
  } = useStorageSettings();
  const isStorageConfigured =
    !isStorageLoading && isStorageConfiguredForUpload(storageSettings);
  const effectiveProvider = getSettingsForUpload(storageSettings).provider;
  const currentStorageProvider = getStorageProviderById(effectiveProvider);
  const [storageSetupDialogOpen, setStorageSetupDialogOpen] = useState(false);

  // Flag to track if editor has been initialized with content
  // Prevents onUpdate from overwriting content before page data is loaded
  const isEditorInitializedRef = useRef(false);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState(state);
  }, []);

  const handleSlashStateChange = useCallback((state: SlashSuggestionState) => {
    setSlashState(state);
  }, []);

  // Parse initial content (sanitization will be done in useContentSanitizer hook)
  let initialParsedContent: unknown = undefined;

  if (content) {
    try {
      // Parse content without sanitization here - sanitization will be done in useContentSanitizer
      initialParsedContent = JSON.parse(content);
    } catch (e) {
      // If content is not valid JSON, report error
      console.error("Failed to parse content:", e);
      if (onContentError) {
        onContentError({
          message: "コンテンツの解析に失敗しました。データが破損している可能性があります。",
          removedNodeTypes: [],
          removedMarkTypes: [],
          wasSanitized: false,
        });
      }
    }
  }

  const editorRef = useRef<Editor | null>(null);
  const openStorageSetupDialog = useCallback(() => {
    setStorageSetupDialogOpen(true);
  }, []);

  const {
    getProviderLabel,
    handleCopyImageUrl,
    canDeleteFromStorage,
    handleDeleteFromStorage,
  } = useStorageActions({
    storageSettings,
    isStorageConfigured,
    currentStorageProvider,
    toast,
  });

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

  // local モード（個人ページ）は awareness なしでも Y.Doc コラボレーション有効
  const useCollaborationMode = Boolean(
    collaborationConfig?.xmlFragment &&
      collaborationConfig?.user
  );

  const editor = useEditor({
    extensions: createEditorExtensions({
      placeholder,
      onLinkClick: handleLinkClick,
      onStateChange: handleStateChange,
      onSlashStateChange: handleSlashStateChange,
      imageUploadOptions: {
        onRetry: handleRetryUpload,
        onRemove: handleRemoveUpload,
        getProviderLabel,
      },
      imageOptions: {
        getProviderLabel,
        canDeleteFromStorage,
        onDeleteFromStorage: handleDeleteFromStorage,
        onCopyUrl: handleCopyImageUrl,
        getAuthenticatedImageUrl: async (url: string) => {
          const token = await getToken();
          if (!token) return null;
          try {
            const r = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) return null;
            const blob = await r.blob();
            return URL.createObjectURL(blob);
          } catch {
            return null;
          }
        },
      },
      collaboration: useCollaborationMode
        ? {
            document: collaborationConfig!.ydoc,
            field: "default",
            awareness: collaborationConfig!.awareness, // undefined in local mode
            user: collaborationConfig!.user,
          }
        : undefined,
    }),
    content: useCollaborationMode ? undefined : initialParsedContent,
    autofocus: autoFocus ? "end" : false,
    editable: !isReadOnly,
    // Prevent SSR hydration issues
    immediatelyRender: false,
    editorProps: {
      ...defaultEditorProps,
      handleKeyDown: (view, event) => {
        // Slash suggestion takes priority when active
        if (slashState?.active && slashRef.current) {
          return slashRef.current.onKeyDown(event);
        }
        if (suggestionState?.active && suggestionRef.current) {
          return suggestionRef.current.onKeyDown(event);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // Only call onChange after editor has been properly initialized with content
      // This prevents overwriting page content with empty editor state
      if (!isEditorInitializedRef.current) {
        const currentJson = JSON.stringify(editor.getJSON());
        const isEmpty = currentJson.length <= 50; // Empty doc is ~47 chars
        
        // If user is typing in a new/empty page, mark as initialized
        if (!isEmpty) {
          isEditorInitializedRef.current = true;
        } else {
          return;
        }
      }
      const json = JSON.stringify(editor.getJSON());
      onChange(json);
    },
    onCreate: () => {
      // If content was provided at initialization, mark as initialized
      if (initialParsedContent) {
        isEditorInitializedRef.current = true;
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      lastSelectionRef.current = { from, to };
      setSelectedText(text.trim());
      if (useCollaborationMode && collaborationConfig?.awareness) {
        collaborationConfig.updateCursor(from, to);
        collaborationConfig.updateSelection(from, to);
      }
    },
  }, [pageId, useCollaborationMode]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!focusContentRef || !editor) return;
    focusContentRef.current = () => editor.commands.focus();
    return () => {
      focusContentRef.current = null;
    };
  }, [editor, focusContentRef]);

  usePasteImageHandler({ editor, handleImageUpload });

  // isReadOnlyの変更を検知してエディターの編集可能状態を更新
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  // Use content sanitizer hook
  useContentSanitizer({
    editor,
    content,
    onError: onContentError,
    onContentUpdated: (initialized) => {
      if (initialized) {
        isEditorInitializedRef.current = true;
      }
    },
  });

  // Use WikiLink status sync hook
  useWikiLinkStatusSync({
    editor,
    content,
    pageId: pageId || undefined,
    onChange,
  });

  // Update suggestion position
  useEffect(() => {
    if (!editor || !suggestionState?.active || !suggestionState.range) {
      setSuggestionPos(null);
      return;
    }

    const { from } = suggestionState.range;
    const coords = editor.view.coordsAtPos(from);
    const containerRect = editorContainerRef.current?.getBoundingClientRect();

    if (containerRect) {
      setSuggestionPos({
        top: coords.bottom - containerRect.top + 4,
        left: coords.left - containerRect.left,
      });
    }
  }, [editor, suggestionState]);

  // Update slash suggestion position
  useEffect(() => {
    if (!editor || !slashState?.active || !slashState.range) {
      setSlashPos(null);
      return;
    }

    const { from } = slashState.range;
    const coords = editor.view.coordsAtPos(from);
    const containerRect = editorContainerRef.current?.getBoundingClientRect();

    if (containerRect) {
      setSlashPos({
        top: coords.bottom - containerRect.top + 4,
        left: coords.left - containerRect.left,
      });
    }
  }, [editor, slashState]);

  // Listen for image insert from slash command
  useEffect(() => {
    const handler = () => {
      handleInsertImageClick();
    };
    window.addEventListener('slash-command-insert-image', handler);
    return () => window.removeEventListener('slash-command-insert-image', handler);
  }, [handleInsertImageClick]);

  const handleSuggestionSelect = useCallback(
    async (item: SuggestionItem) => {
      if (!editor || !suggestionState?.range) return;

      const { from, to } = suggestionState.range;

      // Check if this link text is referenced in other pages (ghost_links)
      let referenced = false;
      if (!item.exists) {
        referenced = await checkReferenced(item.title, pageId);
      }

      // Delete the [[ trigger text
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "wikiLink",
                attrs: {
                  title: item.title,
                  exists: item.exists,
                  referenced: referenced,
                },
              },
            ],
            text: `[[${item.title}]]`,
          },
        ])
        .run();

      // Close suggestion
      editor.view.dispatch(
        editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, {
          close: true,
        })
      );
    },
    [editor, suggestionState, checkReferenced, pageId]
  );

  const handleSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true })
    );
  }, [editor]);

  const handleOpenMermaidDialog = useCallback(() => {
    if (!selectedText) return;
    setSelectedTextForMermaid(selectedText);
    setMermaidDialogOpen(true);
  }, [selectedText]);

  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      // 選択テキストを削除してMermaidを挿入
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor]
  );

  const { getToken } = useAuth();
  const thumbnailApiBaseUrl = getThumbnailApiBaseUrl();

  const handleInsertThumbnailImage = useCallback(
    async (imageUrl: string, alt: string, previewUrl?: string) => {
      if (!editor) return;
      const token = await getToken();
      if (!token) {
        toast({
          title: "ログインが必要です",
          description: "画像の保存にはログインしてください",
          variant: "destructive",
        });
        return;
      }
      if (!thumbnailApiBaseUrl) {
        toast({
          title: "設定エラー",
          description: "APIのURLが設定されていません",
          variant: "destructive",
        });
        return;
      }

      const altText = alt || pageTitle || "thumbnail";

      try {
        const response = await fetch(
          `${thumbnailApiBaseUrl}/api/thumbnail/commit`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              sourceUrl: imageUrl,
              fallbackUrl: previewUrl,
              title: altText,
            }),
          }
        );

        if (!response.ok) {
          let message = `画像の保存に失敗しました: ${response.status}`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data?.error) {
              message = data.error;
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }

        const data = (await response.json()) as {
          imageUrl?: string;
          provider?: string;
        };

        if (!data.imageUrl) {
          throw new Error("画像のURLが取得できませんでした");
        }

        editor
          .chain()
          .focus()
          .insertContentAt(0, {
            type: "image",
            attrs: {
              src: data.imageUrl,
              alt: altText,
              title: altText,
              storageProviderId: "s3",
            },
          })
          .run();
      } catch (error) {
        toast({
          title: "画像の保存に失敗しました",
          description:
            error instanceof Error ? error.message : "画像の保存に失敗しました",
          variant: "destructive",
        });
      }
    },
    [editor, getToken, thumbnailApiBaseUrl, pageTitle, toast]
  );

  const handleSlashClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(slashSuggestionPluginKey, { close: true })
    );
  }, [editor]);

  const handleGoToStorageSettings = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ returnTo }).toString();
    navigate(`/settings/storage?${search}`);
  }, [navigate, location.pathname, location.search]);

  return (
    <div
      ref={editorContainerRef}
      className={cn("relative", className, isDraggingOver && "ring-2 ring-primary ring-dashed")}
      style={{ "--editor-font-size": `${editorFontSizePx}px` } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      <EditorContent editor={editor} />

      {/* Bubble Menus */}
      {editor && !isReadOnly && (
        <>
          <EditorBubbleMenu editor={editor} />
          <TableBubbleMenu editor={editor} />
        </>
      )}

      {/* Drag overlay */}
      <DragOverlay isVisible={isDraggingOver} />

      {/* Wiki Link Suggestion Popup */}
      <WikiLinkSuggestionLayer
        editor={editor}
        suggestionState={suggestionState}
        position={suggestionPos}
        suggestionRef={suggestionRef}
        onSelect={handleSuggestionSelect}
        onClose={handleSuggestionClose}
      />

      {/* Slash Command Suggestion Popup */}
      {!isReadOnly && (
        <SlashSuggestionLayer
          editor={editor}
          suggestionState={slashState}
          position={slashPos}
          suggestionRef={slashRef}
          onClose={handleSlashClose}
        />
      )}

      {/* Mermaid Generator Dialog */}
      <MermaidGeneratorDialog
        open={mermaidDialogOpen}
        onOpenChange={setMermaidDialogOpen}
        selectedText={selectedTextForMermaid}
        onInsert={handleInsertMermaid}
      />

      {/* Create Page Confirmation Dialog */}
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

      {showToolbar && (
        <EditorBottomToolbar
          isReadOnly={isReadOnly}
          showDiagramAction={selectedText.length > 0}
          onInsertImage={handleInsertImageClick}
          onGenerateDiagram={handleOpenMermaidDialog}
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
