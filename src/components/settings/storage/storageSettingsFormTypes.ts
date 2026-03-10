import type { StorageProviderInfo, StorageSettings } from "@/types/storage";

export interface StorageSettingsFormContentProps {
  useExternalStorage: boolean;
  useExternalStorageEffective: boolean;
  effectiveProvider: string;
  settings: StorageSettings;
  currentProvider: StorageProviderInfo;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  updateSettings: (updates: Partial<StorageSettings>) => void;
  updateConfig: (updates: Partial<StorageSettings["config"]>) => void;
  isSaving: boolean;
  isTesting: boolean;
  testResult: { success: boolean; message: string; error?: string } | null;
}
