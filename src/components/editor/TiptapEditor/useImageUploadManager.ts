import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { StorageSettings } from "@/types/storage";
import {
  runSingleUpload,
  filterImageFiles,
  updateUploadNodeAttributesImpl,
  replaceUploadNodeWithImageImpl,
  removeUploadNodeImpl,
} from "./useImageUploadManagerHelpers";

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

/* eslint-disable max-lines-per-function -- Issue #72 Phase 3: runSingleUpload + editor ops extracted; further hook split deferred */
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
  const { getToken } = useAuth();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pendingRetryUploadId, setPendingRetryUploadId] = useState<string | null>(null);
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
    (uploadId: string, attrs: Record<string, unknown>) =>
      updateUploadNodeAttributesImpl(editorRef.current, uploadId, attrs),
    [editorRef],
  );

  const replaceUploadNodeWithImage = useCallback(
    (uploadId: string, attrs: Record<string, unknown>) =>
      replaceUploadNodeWithImageImpl(
        editorRef.current,
        uploadId,
        attrs,
        onChange,
        cleanupUploadResources,
      ),
    [cleanupUploadResources, editorRef, onChange],
  );

  const removeUploadNode = useCallback(
    (uploadId: string) => removeUploadNodeImpl(editorRef.current, uploadId, cleanupUploadResources),
    [cleanupUploadResources, editorRef],
  );

  const startUpload = useCallback(
    async (uploadId: string, file: File) => {
      await runSingleUpload({
        uploadId,
        file,
        isStorageConfigured,
        storageSettings,
        getToken,
        uploadFilesRef,
        uploadTimersRef,
        onStorageError: (message) =>
          toast({
            title: "ストレージ設定エラー",
            description: message,
            variant: "destructive",
          }),
        updateUploadNodeAttributes,
        replaceUploadNodeWithImage,
      });
    },
    [
      isStorageConfigured,
      getToken,
      storageSettings,
      toast,
      updateUploadNodeAttributes,
      replaceUploadNodeWithImage,
    ],
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
    [startUpload, updateUploadNodeAttributes],
  );

  const handleRemoveUpload = useCallback(
    (uploadId: string) => {
      removeUploadNode(uploadId);
    },
    [removeUploadNode],
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
    [createUploadId, storageSettings.provider],
  );

  const insertUploadItems = useCallback(
    (
      uploadItems: Array<{ uploadId: string; file: File; attrs: Record<string, unknown> }>,
      insertAtStart: boolean,
    ) => {
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
    [editorRef],
  );

  const startUploads = useCallback(
    (uploadItems: Array<{ uploadId: string; file: File }>) => {
      uploadItems.forEach((item) => {
        void startUpload(item.uploadId, item.file);
      });
    },
    [startUpload],
  );

  const processImageUpload = useCallback(
    (files: FileList | File[], insertAtStart: boolean) => {
      if (!editorRef.current || isReadOnly) return;
      if (pendingRetryUploadId) setPendingRetryUploadId(null);
      if (isStorageLoading) {
        toast({ title: "読み込み中", description: "ストレージ設定を読み込み中です" });
        return;
      }
      const imageFiles = filterImageFiles(files);
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
      insertUploadItems(uploadItems, insertAtStart);
      startUploads(uploadItems);
    },
    [
      createUploadItems,
      isReadOnly,
      isStorageConfigured,
      isStorageLoading,
      insertUploadItems,
      onRequestStorageSetup,
      pendingRetryUploadId,
      restoreSelectionIfNeeded,
      startUploads,
      toast,
      editorRef,
    ],
  );

  const handleImageUpload = useCallback(
    (files: FileList | File[]) => processImageUpload(files, false),
    [processImageUpload],
  );

  const handleImageUploadAtStart = useCallback(
    (files: FileList | File[]) => processImageUpload(files, true),
    [processImageUpload],
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
    [startUpload, storageSettings.provider, updateUploadNodeAttributes],
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
    [handleImageUpload, handleRetryWithFile, pendingRetryUploadId],
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
    [handleImageUpload],
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
