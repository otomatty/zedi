import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getStorageProvider, getSettingsForUpload } from "@/lib/storage";
import {
  getStorageProviderById,
  type StorageSettings,
  type StorageProviderInfo,
  type StorageProviderType,
} from "@/types/storage";

type ToastFn = ReturnType<typeof useToast>["toast"];

interface UseStorageActionsParams {
  storageSettings: StorageSettings;
  isStorageConfigured: boolean;
  currentStorageProvider?: StorageProviderInfo;
  toast: ToastFn;
}

export function useStorageActions({
  storageSettings,
  isStorageConfigured,
  currentStorageProvider,
  toast,
}: UseStorageActionsParams) {
  const effectiveProvider = getSettingsForUpload(storageSettings).provider;

  const getProviderLabel = useCallback(
    (providerId?: string | null) => {
      const provider =
        providerId && providerId !== effectiveProvider
          ? getStorageProviderById(providerId as StorageProviderType)
          : currentStorageProvider;
      return provider?.name ?? "未設定";
    },
    [currentStorageProvider, effectiveProvider]
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
      if (providerId && providerId !== effectiveProvider) return false;
      try {
        const provider = getStorageProvider(getSettingsForUpload(storageSettings));
        return typeof provider.deleteImage === "function";
      } catch {
        return false;
      }
    },
    [isStorageConfigured, storageSettings, effectiveProvider]
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
      if (providerId && providerId !== effectiveProvider) {
        toast({
          title: "保存先が一致しません",
          description: "画像の保存先設定を確認してください",
          variant: "destructive",
        });
        throw new Error("Storage provider mismatch");
      }

      let provider: ReturnType<typeof getStorageProvider>;
      try {
        provider = getStorageProvider(getSettingsForUpload(storageSettings));
      } catch (error) {
        toast({
          title: "ストレージ設定エラー",
          description: error instanceof Error ? error.message : "設定内容を確認してください",
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

  return {
    getProviderLabel,
    handleCopyImageUrl,
    canDeleteFromStorage,
    handleDeleteFromStorage,
  };
}
