import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { getStorageProvider, getSettingsForUpload } from "@/lib/storage";
import type { StorageSettings } from "@/types/storage";

export function updateUploadNodeAttributesImpl(
  editor: Editor | null,
  uploadId: string,
  attrs: Record<string, unknown>,
): void {
  if (!editor) return;
  const { state, view } = editor;
  let tr = state.tr;
  let updated = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name === "imageUpload" && node.attrs.uploadId === uploadId) {
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      updated = true;
      return false;
    }
    return true;
  });
  if (updated) view.dispatch(tr);
}

export function replaceUploadNodeWithImageImpl(
  editor: Editor | null,
  uploadId: string,
  attrs: Record<string, unknown>,
  onChange: (json: string) => void,
  cleanup: (uploadId: string) => void,
): void {
  if (!editor) return;
  const { state, view } = editor;
  const imageType = state.schema.nodes.image;
  if (!imageType) return;
  let tr = state.tr;
  let replaced = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name === "imageUpload" && node.attrs.uploadId === uploadId) {
      tr = tr.delete(pos, pos + node.nodeSize).insert(pos, imageType.create(attrs));
      replaced = true;
      return false;
    }
    return true;
  });
  if (replaced) {
    view.dispatch(tr);
    onChange(JSON.stringify(editor.getJSON()));
  }
  cleanup(uploadId);
}

export function removeUploadNodeImpl(
  editor: Editor | null,
  uploadId: string,
  cleanup: (uploadId: string) => void,
): void {
  if (!editor) return;
  const { state, view } = editor;
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
  if (removed) view.dispatch(tr);
  cleanup(uploadId);
}

export interface RunUploadParams {
  uploadId: string;
  file: File;
  isStorageConfigured: boolean;
  storageSettings: StorageSettings;
  getToken: () => Promise<string | null>;
  uploadFilesRef: MutableRefObject<Map<string, File>>;
  uploadTimersRef: MutableRefObject<Map<string, number>>;
  onStorageError: (message: string) => void;
  updateUploadNodeAttributes: (uploadId: string, attrs: Record<string, unknown>) => void;
  replaceUploadNodeWithImage: (uploadId: string, attrs: Record<string, unknown>) => void;
}

export async function runSingleUpload(params: RunUploadParams): Promise<void> {
  const {
    uploadId,
    file,
    isStorageConfigured,
    storageSettings,
    getToken,
    uploadFilesRef,
    uploadTimersRef,
    onStorageError,
    updateUploadNodeAttributes,
    replaceUploadNodeWithImage,
  } = params;

  if (!isStorageConfigured) {
    updateUploadNodeAttributes(uploadId, {
      status: "error",
      errorMessage: "ストレージ設定が完了していません",
    });
    return;
  }

  const uploadSettings = getSettingsForUpload(storageSettings);
  let provider: ReturnType<typeof getStorageProvider>;
  try {
    provider = getStorageProvider(uploadSettings, { getToken });
  } catch (error) {
    onStorageError(error instanceof Error ? error.message : "設定内容を確認してください");
    throw error;
  }

  let hasRealProgress = false;
  let simulatedProgress = 0;

  updateUploadNodeAttributes(uploadId, {
    status: "uploading",
    progress: 0,
    errorMessage: null,
    fileName: file.name,
    providerId: uploadSettings.provider,
  });
  uploadFilesRef.current.set(uploadId, file);

  const timerId = window.setInterval(() => {
    if (hasRealProgress) return;
    simulatedProgress = Math.min(90, simulatedProgress + Math.floor(Math.random() * 8) + 4);
    updateUploadNodeAttributes(uploadId, { progress: simulatedProgress });
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
      storageProviderId: uploadSettings.provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像のアップロードに失敗しました";
    updateUploadNodeAttributes(uploadId, { status: "error", errorMessage: message });
  } finally {
    const activeTimer = uploadTimersRef.current.get(uploadId);
    if (activeTimer) {
      window.clearInterval(activeTimer);
      uploadTimersRef.current.delete(uploadId);
    }
  }
}

export function filterImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}
