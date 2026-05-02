// 画像アップロードを管理するカスタムフック

import { useState, useCallback } from "react";
import i18n from "@/i18n";
import { useStorageSettings } from "./useStorageSettings";
import { useAuth } from "./useAuth";
import {
  getStorageProvider,
  getSettingsForUpload,
  isStorageConfiguredForUpload,
  convertToWebP,
  UploadProgress,
} from "@/lib/storage";

interface ImageUploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
}

interface ImageUploadOptions {
  signal?: AbortSignal;
}

interface UseImageUploadReturn {
  uploadImage: (file: File, options?: ImageUploadOptions) => Promise<string>;
  uploadImages: (files: File[]) => Promise<string[]>;
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
  isConfigured: boolean;
  clearError: () => void;
}

/**
 * 画像アップロードを管理するカスタムフック。
 * 設定済みストレージプロバイダーへの単一/複数アップロード、進捗・エラー状態、
 * AbortSignal によるキャンセルをまとめて扱う。
 *
 * Custom hook that wraps single/batch image uploads to the configured storage
 * provider and exposes progress, error and cancellation handling.
 */
export function useImageUpload(): UseImageUploadReturn {
  const { settings, isLoading } = useStorageSettings();
  const { getToken } = useAuth();
  const [state, setState] = useState<ImageUploadState>({
    isUploading: false,
    progress: null,
    error: null,
  });

  const isConfigured = !isLoading && isStorageConfiguredForUpload(settings);

  /**
   * 単一の画像をアップロードする。
   * Uploads a single image. JPEG/PNG は WebP に変換してからアップロードする。
   *
   * @param file - 対象ファイル / Image file
   * @param options.signal - 呼び出し側で中断するための AbortSignal / AbortSignal
   */
  const uploadImage = useCallback(
    async (file: File, options: ImageUploadOptions = {}): Promise<string> => {
      const { signal } = options;
      const throwIfAborted = () => {
        if (signal?.aborted) {
          throw new DOMException("Image upload aborted", "AbortError");
        }
      };

      throwIfAborted();

      if (!isStorageConfiguredForUpload(settings)) {
        throw new Error(i18n.t("errors.storageNotConfigured"));
      }

      if (!file.type.startsWith("image/")) {
        throw new Error(i18n.t("errors.imageOnly"));
      }

      setState((prev) => ({
        ...prev,
        isUploading: true,
        error: null,
        progress: { loaded: 0, total: file.size, percentage: 0 },
      }));

      try {
        const provider = getStorageProvider(getSettingsForUpload(settings), {
          getToken,
        });

        // JPEG/PNG のみ WebP に変換（GIF はそのまま。APNG は MIME が image/png のため現状は変換対象）
        const isStaticImage = file.type === "image/jpeg" || file.type === "image/png";
        const fileToUpload = isStaticImage ? await convertToWebP(file) : file;
        throwIfAborted();

        const url = await provider.uploadImage(fileToUpload, {
          onProgress: (progress) => {
            setState((prev) => ({ ...prev, progress }));
          },
          signal,
        });
        // NOTE: do NOT call `throwIfAborted()` here. The remote write has
        // already completed at this point; throwing now would hide a
        // successful upload from the caller and orphan the stored asset.
        // Cancellation must propagate via the `signal` passed into the
        // provider above, before the upload resolves.
        // ここで throwIfAborted を呼ぶとアップロード完了済みのアセットが孤児化する。
        // キャンセルは signal 経由で provider に伝えること。

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: { loaded: fileToUpload.size, total: fileToUpload.size, percentage: 100 },
        }));

        return url;
      } catch (error) {
        const isAborted =
          signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
        if (isAborted) {
          setState((prev) => ({
            ...prev,
            isUploading: false,
            progress: null,
            error: null,
          }));
          throw error;
        }
        const errorMessage =
          error instanceof Error ? error.message : i18n.t("errors.imageUploadFailed");
        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: null,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [settings, getToken],
  );

  /**
   * 複数の画像を並列でアップロードする。
   * Uploads multiple images in parallel via {@link uploadImage}.
   *
   * @param files - 入力ファイル群（image/* 以外は事前に除外する） / Input files (non-image entries are dropped)
   */
  const uploadImages = useCallback(
    async (files: File[]): Promise<string[]> => {
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        throw new Error(i18n.t("errors.imageNotSelected"));
      }

      setState((prev) => ({
        ...prev,
        isUploading: true,
        error: null,
      }));

      try {
        const urls = await Promise.all(imageFiles.map((file) => uploadImage(file)));

        setState((prev) => ({ ...prev, isUploading: false }));

        return urls;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : i18n.t("errors.imageUploadFailed");
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [uploadImage],
  );

  /**
   * 直近のエラー状態をクリアする。
   * Clears the latest error state so subsequent uploads start clean.
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    uploadImage,
    uploadImages,
    isUploading: state.isUploading,
    progress: state.progress,
    error: state.error,
    isConfigured,
    clearError,
  };
}
