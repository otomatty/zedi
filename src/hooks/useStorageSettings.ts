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
  isStorageConfiguredForUpload,
  ConnectionTestResult,
} from "@/lib/storage";
import { useAuth } from "./useAuth";

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
  const { getToken, isSignedIn } = useAuth();
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

      // 外部ストレージに切り替えたときに provider が s3 のままなら外部の先頭に合わせる
      if (updates.preferDefaultStorage === false && prev.provider === "s3") {
        newSettings.provider = "gyazo";
        newSettings.config = {};
        newSettings.isConfigured = false;
      }
      // プロバイダーが変更された場合、設定をリセット
      else if (updates.provider && updates.provider !== prev.provider) {
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
        isConfigured: isStorageConfiguredForUpload(settings),
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

  // 接続テストを実行する（デフォルト優先のときはデフォルトストレージ、外部のときは選択中の外部プロバイダー）
  const test = useCallback(async (): Promise<ConnectionTestResult> => {
    if (!isSignedIn && settings.preferDefaultStorage !== false) {
      const noAuthResult: ConnectionTestResult = {
        success: false,
        message: "デフォルトストレージのテストにはサインインが必要です",
      };
      setTestResult(noAuthResult);
      return noAuthResult;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const settingsToTest =
        settings.preferDefaultStorage !== false
          ? { ...settings, provider: "s3" as const, config: {} }
          : settings;
      const provider = getStorageProvider(settingsToTest, { getToken });
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
  }, [settings, getToken, isSignedIn]);

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
