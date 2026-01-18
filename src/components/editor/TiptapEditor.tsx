import React, { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import { cn } from "@/lib/utils";
import {
  wikiLinkSuggestionPluginKey,
  type WikiLinkSuggestionState,
} from "./extensions/wikiLinkSuggestionPlugin";
import {
  WikiLinkSuggestion,
  type SuggestionItem,
  type WikiLinkSuggestionHandle,
} from "./extensions/WikiLinkSuggestion";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";
import { useContentSanitizer, type ContentError } from "./TiptapEditor/useContentSanitizer";
import { useWikiLinkNavigation } from "./TiptapEditor/useWikiLinkNavigation";
import { useWikiLinkStatusSync } from "./TiptapEditor/useWikiLinkStatusSync";
import { useEditorSelectionMenu } from "./TiptapEditor/useEditorSelectionMenu";
import { createEditorExtensions, defaultEditorProps } from "./TiptapEditor/editorConfig";
import { CreatePageDialog } from "./TiptapEditor/CreatePageDialog";
import type { TiptapEditorProps } from "./TiptapEditor/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react";
import { getStorageProvider } from "@/lib/storage";
import { getStorageProviderById } from "@/types/storage";
import type { StorageProviderType } from "@/types/storage";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { useToast } from "@/hooks/use-toast";

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
  isReadOnly = false,
  onContentError,
}) => {
  const { checkReferenced } = useCheckGhostLinkReferenced();

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
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Mermaid generator state
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const [selectedTextForMermaid, setSelectedTextForMermaid] = useState("");

  // Selection menu hook
  const {
    showMenu: showSelectionMenu,
    menuPosition: selectionMenuPos,
    selectedText,
    handleOpenMermaidDialog: handleOpenMermaidDialogFromHook,
    handleSelectionUpdate,
  } = useEditorSelectionMenu({
    containerRef: editorContainerRef,
    onOpenMermaidDialog: (text) => {
      setSelectedTextForMermaid(text);
      setMermaidDialogOpen(true);
    },
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    settings: storageSettings,
    isLoading: isStorageLoading,
    isTesting: isStorageTesting,
    testResult: storageTestResult,
    test: testStorageConnection,
  } = useStorageSettings();
  const isStorageConfigured = !isStorageLoading && storageSettings.isConfigured;
  const currentStorageProvider = getStorageProviderById(storageSettings.provider);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [storageSetupDialogOpen, setStorageSetupDialogOpen] = useState(false);
  const [pendingRetryUploadId, setPendingRetryUploadId] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFilesRef = useRef<Map<string, File>>(new Map());
  const uploadPreviewUrlsRef = useRef<Map<string, string>>(new Map());
  const uploadTimersRef = useRef<Map<string, number>>(new Map());

  // Flag to track if editor has been initialized with content
  // Prevents onUpdate from overwriting content before page data is loaded
  const isEditorInitializedRef = useRef(false);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState(state);
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

  const getProviderLabel = useCallback(
    (providerId?: string | null) => {
      const provider =
        providerId && providerId !== storageSettings.provider
          ? getStorageProviderById(providerId as StorageProviderType)
          : currentStorageProvider;
      return provider?.name ?? "未設定";
    },
    [currentStorageProvider, storageSettings.provider]
  );

  const handleCopyImageUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "URLをコピーしました" });
      } catch {
        toast({
          title: "コピーに失敗しました",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const canDeleteFromStorage = useCallback(
    (providerId?: string | null) => {
      if (!isStorageConfigured) return false;
      if (providerId && providerId !== storageSettings.provider) return false;
      try {
        const provider = getStorageProvider(storageSettings);
        return typeof provider.deleteImage === "function";
      } catch {
        return false;
      }
    },
    [isStorageConfigured, storageSettings]
  );

  const handleDeleteFromStorage = useCallback(
    async (url: string, providerId?: string | null) => {
      if (!isStorageConfigured) {
        toast({
          title: "ストレージ未設定",
          description: "ストレージ設定を確認してください",
          variant: "destructive",
        });
        throw new Error("Storage not configured");
      }
      if (providerId && providerId !== storageSettings.provider) {
        toast({
          title: "保存先が一致しません",
          description: "画像の保存先設定を確認してください",
          variant: "destructive",
        });
        throw new Error("Storage provider mismatch");
      }

      let provider: ReturnType<typeof getStorageProvider>;
      try {
        provider = getStorageProvider(storageSettings);
      } catch (error) {
        toast({
          title: "ストレージ設定エラー",
          description:
            error instanceof Error ? error.message : "設定内容を確認してください",
          variant: "destructive",
        });
        throw error;
      }
      if (!provider.deleteImage) {
        toast({
          title: "削除未対応",
          description: "このストレージは削除APIに対応していません",
          variant: "destructive",
        });
        throw new Error("Delete not supported");
      }

      await provider.deleteImage(url);
      toast({ title: "ストレージから削除しました" });
    },
    [isStorageConfigured, storageSettings, toast]
  );

  const cleanupUploadResources = useCallback((uploadId: string) => {
    const previewUrl = uploadPreviewUrlsRef.current.get(uploadId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      uploadPreviewUrlsRef.current.delete(uploadId);
    }
    uploadFilesRef.current.delete(uploadId);
    const timerId = uploadTimersRef.current.get(uploadId);
    if (timerId) {
      window.clearInterval(timerId);
      uploadTimersRef.current.delete(uploadId);
    }
  }, []);

  const updateUploadNodeAttributes = useCallback(
    (uploadId: string, attrs: Record<string, unknown>) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;

      const { state, view } = activeEditor;
      let tr = state.tr;
      let updated = false;

      state.doc.descendants((node, pos) => {
        if (
          node.type.name === "imageUpload" &&
          node.attrs.uploadId === uploadId
        ) {
          tr = tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            ...attrs,
          });
          updated = true;
          return false;
        }
        return true;
      });

      if (updated) {
        view.dispatch(tr);
      }
    },
    []
  );

  const replaceUploadNodeWithImage = useCallback(
    (uploadId: string, attrs: Record<string, unknown>) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;

      const { state, view } = activeEditor;
      const imageType = state.schema.nodes.image;
      if (!imageType) return;

      let tr = state.tr;
      let replaced = false;

      state.doc.descendants((node, pos) => {
        if (
          node.type.name === "imageUpload" &&
          node.attrs.uploadId === uploadId
        ) {
          tr = tr.setNodeMarkup(pos, imageType, attrs);
          replaced = true;
          return false;
        }
        return true;
      });

      if (replaced) {
        view.dispatch(tr);
      }
      cleanupUploadResources(uploadId);
    },
    [cleanupUploadResources]
  );

  const removeUploadNode = useCallback(
    (uploadId: string) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;

      const { state, view } = activeEditor;
      let tr = state.tr;
      let removed = false;

      state.doc.descendants((node, pos) => {
        if (
          node.type.name === "imageUpload" &&
          node.attrs.uploadId === uploadId
        ) {
          tr = tr.delete(pos, pos + node.nodeSize);
          removed = true;
          return false;
        }
        return true;
      });

      if (removed) {
        view.dispatch(tr);
      }
      cleanupUploadResources(uploadId);
    },
    [cleanupUploadResources]
  );

  const startUpload = useCallback(
    async (uploadId: string, file: File) => {
      if (!isStorageConfigured) {
        updateUploadNodeAttributes(uploadId, {
          status: "error",
          errorMessage: "ストレージ設定が完了していません",
        });
        return;
      }

      let provider: ReturnType<typeof getStorageProvider>;
      try {
        provider = getStorageProvider(storageSettings);
      } catch (error) {
        toast({
          title: "ストレージ設定エラー",
          description:
            error instanceof Error ? error.message : "設定内容を確認してください",
          variant: "destructive",
        });
        throw error;
      }
      let hasRealProgress = false;
      let simulatedProgress = 0;

      updateUploadNodeAttributes(uploadId, {
        status: "uploading",
        progress: 0,
        errorMessage: null,
        fileName: file.name,
        providerId: storageSettings.provider,
      });
      uploadFilesRef.current.set(uploadId, file);

      const timerId = window.setInterval(() => {
        if (hasRealProgress) return;
        simulatedProgress = Math.min(
          90,
          simulatedProgress + Math.floor(Math.random() * 8) + 4
        );
        updateUploadNodeAttributes(uploadId, {
          progress: simulatedProgress,
        });
      }, 500);
      uploadTimersRef.current.set(uploadId, timerId);

      try {
        const url = await provider.uploadImage(file, {
          onProgress: (progress) => {
            hasRealProgress = true;
            updateUploadNodeAttributes(uploadId, {
              progress: Math.round(progress.percentage),
            });
          },
        });

        updateUploadNodeAttributes(uploadId, { progress: 100 });
        replaceUploadNodeWithImage(uploadId, {
          src: url,
          alt: file.name,
          title: file.name,
          storageProviderId: storageSettings.provider,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "画像のアップロードに失敗しました";
        updateUploadNodeAttributes(uploadId, {
          status: "error",
          errorMessage: message,
        });
      } finally {
        const activeTimer = uploadTimersRef.current.get(uploadId);
        if (activeTimer) {
          window.clearInterval(activeTimer);
          uploadTimersRef.current.delete(uploadId);
        }
      }
    },
    [
      toast,
      isStorageConfigured,
      storageSettings,
      updateUploadNodeAttributes,
      replaceUploadNodeWithImage,
    ]
  );

  const handleRetryUpload = useCallback(
    (uploadId: string) => {
      const existingFile = uploadFilesRef.current.get(uploadId);
      if (existingFile) {
        updateUploadNodeAttributes(uploadId, {
          status: "uploading",
          progress: 0,
          errorMessage: null,
        });
        void startUpload(uploadId, existingFile);
        return;
      }

      setPendingRetryUploadId(uploadId);
      fileInputRef.current?.click();
    },
    [startUpload, updateUploadNodeAttributes]
  );

  const handleRemoveUpload = useCallback(
    (uploadId: string) => {
      removeUploadNode(uploadId);
    },
    [removeUploadNode]
  );

  const editor = useEditor({
    extensions: createEditorExtensions({
      placeholder,
      onLinkClick: handleLinkClick,
      onStateChange: handleStateChange,
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
      },
    }),
    content: initialParsedContent,
    autofocus: autoFocus ? "end" : false,
    editable: !isReadOnly,
    // Prevent SSR hydration issues
    immediatelyRender: false,
    editorProps: {
      ...defaultEditorProps,
      handleKeyDown: (view, event) => {
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
    onSelectionUpdate: handleSelectionUpdate,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // isReadOnlyの変更を検知してエディターの編集可能状態を更新
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  useEffect(() => {
    return () => {
      uploadTimersRef.current.forEach((timerId) => {
        window.clearInterval(timerId);
      });
      uploadTimersRef.current.clear();
      uploadPreviewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      uploadPreviewUrlsRef.current.clear();
      uploadFilesRef.current.clear();
    };
  }, []);

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

  // Handle Mermaid generation (use hook's handler)
  const handleOpenMermaidDialog = handleOpenMermaidDialogFromHook;

  const handleInsertMermaid = useCallback(
    (code: string) => {
      if (!editor) return;
      // 選択テキストを削除してMermaidを挿入
      editor.chain().focus().deleteSelection().insertMermaid(code).run();
    },
    [editor]
  );

  const createUploadId = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const handleGoToStorageSettings = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ returnTo }).toString();
    navigate(`/settings/storage?${search}`);
  }, [navigate, location.pathname, location.search]);

  const handleTestStorageConnection = useCallback(async () => {
    if (!isStorageConfigured) {
      toast({
        title: "ストレージ未設定",
        description: "ストレージ設定を行ってから接続テストを実行してください",
        variant: "destructive",
      });
      return;
    }
    const result = await testStorageConnection();
    if (result.success) {
      toast({ title: "接続成功", description: result.message });
    } else {
      toast({
        title: "接続失敗",
        description: result.message,
        variant: "destructive",
      });
    }
  }, [isStorageConfigured, testStorageConnection, toast]);

  const handleImageUpload = useCallback(
    (files: FileList | File[]) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;
      if (isReadOnly) return;
      if (pendingRetryUploadId) {
        setPendingRetryUploadId(null);
      }

      if (isStorageLoading) {
        toast({
          title: "読み込み中",
          description: "ストレージ設定を読み込み中です",
        });
        return;
      }

      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/")
      );

      if (imageFiles.length === 0) {
        toast({
          title: "画像ファイルのみ対応",
          description: "画像ファイルを選択してください",
          variant: "destructive",
        });
        return;
      }

      if (!isStorageConfigured) {
        setStorageSetupDialogOpen(true);
        return;
      }

      const uploadItems = imageFiles.map((file) => {
        const uploadId = createUploadId();
        const previewUrl = URL.createObjectURL(file);
        uploadFilesRef.current.set(uploadId, file);
        uploadPreviewUrlsRef.current.set(uploadId, previewUrl);
        return {
          uploadId,
          file,
          attrs: {
            uploadId,
            status: "uploading",
            progress: 0,
            previewUrl,
            fileName: file.name,
            providerId: storageSettings.provider,
          },
        };
      });

      activeEditor
        .chain()
        .focus()
        .insertContent(
          uploadItems.map((item) => ({
            type: "imageUpload",
            attrs: item.attrs,
          }))
        )
        .run();

      uploadItems.forEach((item) => {
        void startUpload(item.uploadId, item.file);
      });
    },
    [
      createUploadId,
      isReadOnly,
      isStorageConfigured,
      isStorageLoading,
      pendingRetryUploadId,
      startUpload,
      storageSettings.provider,
      setPendingRetryUploadId,
      toast,
    ]
  );

  const handleRetryWithFile = useCallback(
    (uploadId: string, file: File) => {
      const previewUrl = URL.createObjectURL(file);
      const existingPreview = uploadPreviewUrlsRef.current.get(uploadId);
      if (existingPreview) {
        URL.revokeObjectURL(existingPreview);
      }
      uploadPreviewUrlsRef.current.set(uploadId, previewUrl);
      uploadFilesRef.current.set(uploadId, file);
      updateUploadNodeAttributes(uploadId, {
        previewUrl,
        fileName: file.name,
        status: "uploading",
        progress: 0,
        errorMessage: null,
        providerId: storageSettings.provider,
      });
      void startUpload(uploadId, file);
    },
    [startUpload, storageSettings.provider, updateUploadNodeAttributes]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }

      if (pendingRetryUploadId) {
        handleRetryWithFile(pendingRetryUploadId, e.target.files[0]);
        setPendingRetryUploadId(null);
      } else {
        handleImageUpload(e.target.files);
      }

      // Reset input value to allow selecting the same file again
      e.target.value = "";
    },
    [handleImageUpload, handleRetryWithFile, pendingRetryUploadId]
  );

  const handleInsertImageClick = useCallback(() => {
    if (isStorageLoading) {
      toast({
        title: "読み込み中",
        description: "ストレージ設定を読み込み中です",
      });
      return;
    }
    if (!isStorageConfigured) {
      setStorageSetupDialogOpen(true);
      return;
    }
    setPendingRetryUploadId(null);
    fileInputRef.current?.click();
  }, [isStorageConfigured, isStorageLoading, toast]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (e.dataTransfer?.files?.length) {
        handleImageUpload(e.dataTransfer.files);
      }
    },
    [handleImageUpload]
  );

  // Handle paste events for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length > 0) {
        event.preventDefault();
        const files = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        handleImageUpload(files);
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor, handleImageUpload]);

  const connectionStatus = (() => {
    if (isStorageLoading) {
      return {
        label: "読み込み中",
        variant: "outline" as const,
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      };
    }
    if (!isStorageConfigured) {
      return {
        label: "未設定",
        variant: "outline" as const,
        icon: <XCircle className="h-3 w-3 text-muted-foreground" />,
      };
    }
    if (storageTestResult?.success === true) {
      return {
        label: "接続済み",
        variant: "secondary" as const,
        icon: <CheckCircle2 className="h-3 w-3 text-green-600" />,
      };
    }
    if (storageTestResult?.success === false) {
      return {
        label: "接続失敗",
        variant: "destructive" as const,
        icon: <XCircle className="h-3 w-3" />,
      };
    }
    return {
      label: "未確認",
      variant: "outline" as const,
      icon: null,
    };
  })();

  const storageProviderLabel = currentStorageProvider?.name ?? "未設定";

  return (
    <div
      ref={editorContainerRef}
      className={cn("relative", className, isDraggingOver && "ring-2 ring-primary ring-dashed")}
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

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">保存先</span>
          <Badge variant="outline">{storageProviderLabel}</Badge>
          <Badge
            variant={connectionStatus.variant}
            className="flex items-center gap-1"
          >
            {connectionStatus.icon}
            {connectionStatus.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleGoToStorageSettings}>
            <Settings className="h-4 w-4 mr-1" />
            設定
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestStorageConnection}
            disabled={!isStorageConfigured || isStorageTesting}
          >
            {isStorageTesting && (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            )}
            接続テスト
          </Button>
        </div>
      </div>

      <EditorContent editor={editor} />

      {/* Drag overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none z-40">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg p-4 text-center">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">画像をドロップしてアップロード</p>
          </div>
        </div>
      )}

      {/* Selection Menu - テキスト選択時に表示 */}
      {showSelectionMenu && selectionMenuPos && (
        <div
          className="absolute z-50 flex items-center gap-1 bg-background border rounded-lg shadow-lg p-1"
          style={{
            top: selectionMenuPos.top,
            left: selectionMenuPos.left,
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenMermaidDialog}
            className="text-xs"
          >
            <GitBranch className="h-4 w-4 mr-1" />
            ダイアグラム生成
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleInsertImageClick}
            className="text-xs"
            disabled={isReadOnly}
          >
            <ImageIcon className="h-4 w-4 mr-1" />
            画像を挿入
          </Button>
        </div>
      )}

      {/* Wiki Link Suggestion Popup */}
      {suggestionState?.active && suggestionPos && editor && (
        <div
          className="absolute z-50"
          style={{
            top: suggestionPos.top,
            left: suggestionPos.left,
          }}
        >
          <WikiLinkSuggestion
            ref={suggestionRef}
            editor={editor}
            query={suggestionState.query}
            range={suggestionState.range!}
            onSelect={handleSuggestionSelect}
            onClose={handleSuggestionClose}
          />
        </div>
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

      <AlertDialog
        open={storageSetupDialogOpen}
        onOpenChange={setStorageSetupDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>画像ストレージを設定してください</AlertDialogTitle>
            <AlertDialogDescription>
              画像を挿入するにはストレージ設定が必要です。今すぐ設定しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>あとで</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStorageSetupDialogOpen(false);
                handleGoToStorageSettings();
              }}
            >
              今すぐ設定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TiptapEditor;
