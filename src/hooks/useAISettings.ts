// AI設定を管理するカスタムフック

import { useState, useEffect, useCallback } from "react";
import { AISettings, getDefaultModel, getDefaultModels, getProviderById } from "@/types/ai";
import {
  loadAISettings,
  saveAISettings,
  clearAISettings,
  getDefaultAISettings,
} from "@/lib/aiSettings";
import {
  testConnection,
  ConnectionTestResult,
  getAvailableModels,
  clearModelsCache,
} from "@/lib/aiClient";

interface UseAISettingsReturn {
  settings: AISettings;
  availableModels: string[];
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  testResult: ConnectionTestResult | null;
  updateSettings: (updates: Partial<AISettings>) => void;
  save: () => Promise<boolean>;
  test: () => Promise<ConnectionTestResult>;
  reset: () => void;
}

/**
 * Load/save AI settings, model lists, and connection test from the settings UI.
 */
export function useAISettings(): UseAISettingsReturn {
  const [settings, setSettings] = useState<AISettings>(getDefaultAISettings());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // 初期読み込み
  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadAISettings();
        if (loaded) {
          setSettings(loaded);
          // キャッシュからモデル一覧を取得
          setAvailableModels(getAvailableModels(loaded.provider));
        } else {
          // デフォルトプロバイダー（Google）のモデル一覧
          const defaultSettings = getDefaultAISettings();
          setSettings(defaultSettings);
          setAvailableModels(getDefaultModels(defaultSettings.provider));
        }
      } catch (error) {
        console.error("Failed to load AI settings:", error);
        const defaultSettings = getDefaultAISettings();
        setSettings(defaultSettings);
        setAvailableModels(getDefaultModels(defaultSettings.provider));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // 設定を更新する
  const updateSettings = useCallback((updates: Partial<AISettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };

      // プロバイダーが変更された場合、モデル一覧とデフォルトモデルを切り替え（明示的に model が渡されていればそれを優先）
      if (updates.provider && updates.provider !== prev.provider) {
        const models = getAvailableModels(updates.provider);
        setAvailableModels(models);
        if (updates.model === undefined) {
          newSettings.model = models[0] || getDefaultModel(updates.provider);
        }

        // APIキーが必要かどうかを確認
        const provider = getProviderById(updates.provider);
        if (provider && !provider.requiresApiKey) {
          // APIキー不要のプロバイダーの場合、キーをクリア
          newSettings.apiKey = "";
        }
      }

      // プロバイダーまたはモデルが変わった場合は、呼び出し元が明示的に modelId を渡していなければクリアする（古い modelId の永続化を防ぐ）
      const providerChanged = updates.provider !== undefined && updates.provider !== prev.provider;
      const modelChanged = updates.model !== undefined && updates.model !== prev.model;
      if ((providerChanged || modelChanged) && updates.modelId === undefined) {
        newSettings.modelId = "";
      }

      return newSettings;
    });
    // 設定変更時はテスト結果をリセット
    setTestResult(null);
  }, []);

  // 設定を保存する
  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const isClaudeCode = settings.provider === "claude-code";
      const isServerMode = settings.apiMode === "api_server";
      const provider = getProviderById(settings.provider);

      const needsApiKey = !isClaudeCode && !isServerMode && provider?.requiresApiKey;
      const isConfigured = needsApiKey ? settings.apiKey.trim() !== "" : true;

      const modelId = isClaudeCode
        ? "claude-code:default"
        : `${settings.provider}:${settings.model}`;

      const settingsToSave = {
        ...settings,
        modelId,
        isConfigured,
        // claude-code は API キー不要
        apiKey: isClaudeCode ? "" : settings.apiKey,
      };
      await saveAISettings(settingsToSave);
      setSettings(settingsToSave);
      return true;
    } catch (error) {
      console.error("Failed to save AI settings:", error);
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
      const result = await testConnection(settings.provider, settings.apiKey);
      setTestResult(result);

      // テスト成功時、取得したモデル一覧で更新
      if (result.success && result.models && result.models.length > 0) {
        setAvailableModels(result.models);
        // 現在選択中のモデルが新しいリストにない場合、最初のモデルを選択（modelId も合わせて更新）
        if (!result.models.includes(settings.model)) {
          const first = result.models[0];
          if (first)
            setSettings((prev) => ({
              ...prev,
              model: first,
              modelId: `${prev.provider}:${first}`,
            }));
        }
      }

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
  }, [settings.provider, settings.apiKey, settings.model]);

  // 設定をリセットする
  const reset = useCallback(() => {
    clearAISettings();
    clearModelsCache();
    const defaultSettings = getDefaultAISettings();
    setSettings(defaultSettings);
    setAvailableModels(getDefaultModels(defaultSettings.provider));
    setTestResult(null);
  }, []);

  return {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings,
    save,
    test,
    reset,
  };
}
