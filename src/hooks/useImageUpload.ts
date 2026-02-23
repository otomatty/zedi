// 画像アップロードを管理するカスタムフック

import { useState, useCallback } from "react";
import { useStorageSettings } from "./useStorageSettings";
import { useAuth } from "./useAuth";
import {
  getStorageProvider,
  getSettingsForUpload,
  isStorageConfiguredForUpload,
  UploadProgress,
} from "@/lib/storage";

interface ImageUploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
}

interface UseImageUploadReturn {
  uploadImage: (file: File) => Promise<string>;
  uploadImages: (files: File[]) => Promise<string[]>;
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
  isConfigured: boolean;
  clearError: () => void;
}

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
   * 単一の画像をアップロード
   */
  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      // ストレージ設定の確認
      if (!isStorageConfiguredForUpload(settings)) {
        throw new Error("ストレージが設定されていません。設定画面でストレージを設定してください。");
      }

      // 画像ファイルの検証
      if (!file.type.startsWith("image/")) {
        throw new Error("画像ファイルのみアップロードできます");
      }

      setState((prev) => ({
        ...prev,
        isUploading: true,
        error: null,
        progress: { loaded: 0, total: file.size, percentage: 0 },
      }));

      try {
        // プロバイダーを取得（S3 の場合は getToken を渡す）
        const provider = getStorageProvider(getSettingsForUpload(settings), {
          getToken,
        });

        // アップロード実行
        const url = await provider.uploadImage(file, {
          onProgress: (progress) => {
            setState((prev) => ({ ...prev, progress }));
          },
        });

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: { loaded: file.size, total: file.size, percentage: 100 },
        }));

        return url;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "アップロードに失敗しました";
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [settings, getToken],
  );

  /**
   * 複数の画像を並列でアップロード
   */
  const uploadImages = useCallback(
    async (files: File[]): Promise<string[]> => {
      // 画像ファイルのみをフィルタリング
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        throw new Error("画像ファイルが選択されていません");
      }

      setState((prev) => ({
        ...prev,
        isUploading: true,
        error: null,
      }));

      try {
        // 並列でアップロード
        const urls = await Promise.all(imageFiles.map((file) => uploadImage(file)));

        setState((prev) => ({ ...prev, isUploading: false }));

        return urls;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "アップロードに失敗しました";
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
   * エラーをクリア
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
