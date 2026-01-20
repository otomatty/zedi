import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { Editor } from "@tiptap/core";
import { getStorageProvider } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import type { StorageSettings } from "@/types/storage";

type ToastFn = ReturnType<typeof useToast>["toast"];

interface UseImageUploadManagerParams {
  editorRef: MutableRefObject<Editor | null>;
  onChange: (json: string) => void;
  isReadOnly: boolean;
  isStorageConfigured: boolean;
  isStorageLoading: boolean;
  storageSettings: StorageSettings;
  toast: ToastFn;
  onRequestStorageSetup: () => void;
  lastSelectionRef?: MutableRefObject<{ from: number; to: number } | null>;
}

export function useImageUploadManager({
  editorRef,
  onChange,
  isReadOnly,
  isStorageConfigured,
  isStorageLoading,
  storageSettings,
  toast,
  onRequestStorageSetup,
  lastSelectionRef,
}: UseImageUploadManagerParams) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pendingRetryUploadId, setPendingRetryUploadId] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFilesRef = useRef<Map<string, File>>(new Map());
  const uploadPreviewUrlsRef = useRef<Map<string, string>>(new Map());
  const uploadTimersRef = useRef<Map<string, number>>(new Map());

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
        if (node.type.name === "imageUpload" && node.attrs.uploadId === uploadId) {
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
    [editorRef]
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
        if (node.type.name === "imageUpload" && node.attrs.uploadId === uploadId) {
          tr = tr
            .delete(pos, pos + node.nodeSize)
            .insert(pos, imageType.create(attrs));
          replaced = true;
          return false;
        }
        return true;
      });

      if (replaced) {
        view.dispatch(tr);
        const json = JSON.stringify(activeEditor.getJSON());
        onChange(json);
      }
      cleanupUploadResources(uploadId);
    },
    [cleanupUploadResources, editorRef, onChange]
  );

  const removeUploadNode = useCallback(
    (uploadId: string) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;

      const { state, view } = activeEditor;
      let tr = state.tr;
      let removed = false;

      state.doc.descendants((node, pos) => {
        if (node.type.name === "imageUpload" && node.attrs.uploadId === uploadId) {
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
    [cleanupUploadResources, editorRef]
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
      isStorageConfigured,
      storageSettings,
      toast,
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

  const createUploadId = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const restoreSelectionIfNeeded = useCallback(() => {
    const activeEditor = editorRef.current;
    if (!activeEditor) return;
    if (activeEditor.isFocused) return;
    const lastSelection = lastSelectionRef?.current;
    if (lastSelection) {
      activeEditor.commands.setTextSelection(lastSelection);
    }
  }, [editorRef, lastSelectionRef]);

  const createUploadItems = useCallback(
    (files: File[]) =>
      files.map((file) => {
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
      }),
    [createUploadId, storageSettings.provider]
  );

  const insertUploadItems = useCallback(
    (uploadItems: Array<{ uploadId: string; file: File; attrs: Record<string, unknown> }>, insertAtStart: boolean) => {
      const activeEditor = editorRef.current;
      if (!activeEditor) return;
      const content = uploadItems.map((item) => ({
        type: "imageUpload",
        attrs: item.attrs,
      }));

      const chain = activeEditor.chain().focus();
      if (insertAtStart) {
        chain.insertContentAt(0, content);
      } else {
        chain.insertContent(content);
      }
      chain.run();
    },
    [editorRef]
  );

  const startUploads = useCallback(
    (uploadItems: Array<{ uploadId: string; file: File }>) => {
      uploadItems.forEach((item) => {
        void startUpload(item.uploadId, item.file);
      });
    },
    [startUpload]
  );

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
        onRequestStorageSetup();
        return;
      }

      restoreSelectionIfNeeded();

      const uploadItems = createUploadItems(imageFiles);
      insertUploadItems(uploadItems, false);
      startUploads(uploadItems);
    },
    [
      createUploadItems,
      editorRef,
      isReadOnly,
      isStorageConfigured,
      isStorageLoading,
      insertUploadItems,
      onRequestStorageSetup,
      pendingRetryUploadId,
      restoreSelectionIfNeeded,
      startUploads,
      toast,
    ]
  );

  const handleImageUploadAtStart = useCallback(
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
        onRequestStorageSetup();
        return;
      }

      const uploadItems = createUploadItems(imageFiles);
      insertUploadItems(uploadItems, true);
      startUploads(uploadItems);
    },
    [
      createUploadItems,
      editorRef,
      insertUploadItems,
      isReadOnly,
      isStorageConfigured,
      isStorageLoading,
      onRequestStorageSetup,
      pendingRetryUploadId,
      startUploads,
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
      onRequestStorageSetup();
      return;
    }
    setPendingRetryUploadId(null);
    fileInputRef.current?.click();
  }, [isStorageConfigured, isStorageLoading, onRequestStorageSetup, toast]);

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

  useEffect(() => {
    const timers = uploadTimersRef.current;
    const previewUrls = uploadPreviewUrlsRef.current;
    const files = uploadFilesRef.current;

    return () => {
      timers.forEach((timerId) => {
        window.clearInterval(timerId);
      });
      timers.clear();
      previewUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrls.clear();
      files.clear();
    };
  }, []);

  return {
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
    handleImageUploadAtStart,
  };
}
