// ストレージ設定を管理するカスタムフック

import { useState, useEffect, useCallback } from "react";
import {
  StorageSettings,
  StorageProviderType,
  DEFAULT_STORAGE_SETTINGS,
} from "@/types/storage";
import {
  loadStorageSettings,
  saveStorageSettings,
  clearStorageSettings,
  getDefaultStorageSettings,
} from "@/lib/storageSettings";
import {
  getStorageProvider,
  isProviderConfigured,
  ConnectionTestResult,
} from "@/lib/storage";

interface UseStorageSettingsReturn {
  settings: StorageSettings;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  testResult: ConnectionTestResult | null;
  updateSettings: (updates: Partial<StorageSettings>) => void;
  updateConfig: (
    updates: Partial<StorageSettings["config"]>
  ) => void;
  save: () => Promise<boolean>;
  test: () => Promise<ConnectionTestResult>;
  reset: () => void;
}

export function useStorageSettings(): UseStorageSettingsReturn {
  const [settings, setSettings] = useState<StorageSettings>(
    getDefaultStorageSettings()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null
  );

  // 初期読み込み
  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadStorageSettings();
        if (loaded) {
          setSettings(loaded);
        }
      } catch (error) {
        console.error("Failed to load storage settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // 設定を更新する
  const updateSettings = useCallback((updates: Partial<StorageSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };

      // プロバイダーが変更された場合、設定をリセット
      if (updates.provider && updates.provider !== prev.provider) {
        newSettings.config = {};
        newSettings.isConfigured = false;
      }

      return newSettings;
    });
    // 設定変更時はテスト結果をリセット
    setTestResult(null);
  }, []);

  // 設定のconfigを更新する
  const updateConfig = useCallback(
    (updates: Partial<StorageSettings["config"]>) => {
      setSettings((prev) => ({
        ...prev,
        config: { ...prev.config, ...updates },
      }));
      // 設定変更時はテスト結果をリセット
      setTestResult(null);
    },
    []
  );

  // 設定を保存する
  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const settingsToSave: StorageSettings = {
        ...settings,
        isConfigured: isProviderConfigured(settings.provider, settings.config),
      };
      await saveStorageSettings(settingsToSave);
      setSettings(settingsToSave);
      return true;
    } catch (error) {
      console.error("Failed to save storage settings:", error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  // 接続テストを実行する
  const test = useCallback(async (): Promise<ConnectionTestResult> => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // 現在の設定でプロバイダーを作成
      const provider = getStorageProvider(settings);
      const result = await provider.testConnection();
      setTestResult(result);
      return result;
    } catch (error) {
      const errorResult: ConnectionTestResult = {
        success: false,
        message: "テストの実行に失敗しました",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      setTestResult(errorResult);
      return errorResult;
    } finally {
      setIsTesting(false);
    }
  }, [settings]);

  // 設定をリセットする
  const reset = useCallback(() => {
    clearStorageSettings();
    setSettings(getDefaultStorageSettings());
    setTestResult(null);
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings,
    updateConfig,
    save,
    test,
    reset,
  };
}
