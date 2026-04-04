import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useAISettings } from "@/hooks/useAISettings";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  useSavedIndicator,
  useClaudeCodeAvailability,
  useServerModels,
} from "./useAISettingsFormHelpers";
import type { AIProviderType, AISettings, AIInteractionMode } from "@/types/ai";
import { getInteractionMode } from "@/types/ai";

/** Per-mode snapshot so switching modes does not lose provider/model/API key. / モード切替で値を失わないためのスナップショット */
type ModeFieldsSnapshot = {
  provider: AIProviderType;
  model: string;
  modelId: string;
  apiKey: string;
};

/**
 * Builds persisted field updates for a mode switch and records per-mode snapshots.
 * モード切替用の更新オブジェクトを組み立て、モードごとのスナップショットを記録する。
 */
function buildInteractionModeUpdates(
  settings: AISettings,
  newMode: AIInteractionMode,
  snapshotsRef: MutableRefObject<Partial<Record<AIInteractionMode, ModeFieldsSnapshot>>>,
): Partial<AISettings> {
  const currentMode = getInteractionMode(settings);
  snapshotsRef.current[currentMode] = {
    provider: settings.provider,
    model: settings.model,
    modelId: settings.modelId,
    apiKey: settings.apiKey,
  };

  const snap = snapshotsRef.current[newMode];

  switch (newMode) {
    case "default": {
      const base =
        snap ??
        ({
          provider: settings.provider === "claude-code" ? "google" : settings.provider,
          model: settings.model,
          modelId: settings.modelId,
          apiKey: "",
        } satisfies ModeFieldsSnapshot);
      return {
        provider: base.provider,
        model: base.model,
        modelId: base.modelId,
        apiMode: "api_server",
        apiKey: "",
      };
    }
    case "user_api_key": {
      const base =
        snap ??
        ({
          provider: settings.provider === "claude-code" ? "google" : settings.provider,
          model: settings.model,
          modelId: settings.modelId,
          apiKey: "",
        } satisfies ModeFieldsSnapshot);
      return {
        provider: base.provider,
        model: base.model,
        modelId: base.modelId,
        apiMode: "user_api_key",
        apiKey: base.apiKey,
      };
    }
    case "claude_code": {
      const base =
        snap ??
        ({
          provider: "claude-code",
          model: "default",
          modelId: "claude-code:default",
          apiKey: "",
        } satisfies ModeFieldsSnapshot);
      return {
        provider: "claude-code",
        model: base.model,
        modelId: base.modelId,
        apiMode: "api_server",
        apiKey: "",
      };
    }
  }
}

/**
 * Custom hook for AI settings form state and actions.
 * AI設定フォームの状態とアクションを管理するカスタムフック。
 */
export function useAISettingsForm() {
  const { t } = useTranslation();
  const {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings: updateSettingsBase,
    save,
    test,
    reset,
  } = useAISettings();

  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();

  const { savedAt, clear: clearSavedIndicator, markSaved } = useSavedIndicator();
  const claudeCodeAvailable = useClaudeCodeAvailability();
  const {
    models: serverModels,
    loading: serverModelsLoading,
    error: serverModelsError,
    load: loadServerModels,
  } = useServerModels();

  const interactionMode: AIInteractionMode = isLoading ? "default" : getInteractionMode(settings);
  const isServerMode = interactionMode === "default";
  const isClaudeCode = interactionMode === "claude_code";
  const useOwnKey = interactionMode === "user_api_key";

  const modeSnapshotsRef = useRef<Partial<Record<AIInteractionMode, ModeFieldsSnapshot>>>({});

  useEffect(() => {
    if (isServerMode) {
      loadServerModels();
    }
  }, [isServerMode, loadServerModels]);

  const runSave = useCallback(async () => {
    markSaved(await save());
  }, [save, markSaved]);

  const scheduleSave = useDebouncedCallback(runSave, 800);

  const updateSettings = useCallback(
    (updates: Partial<AISettings>) => {
      clearSavedIndicator();
      const normalizedUpdates =
        (updates.provider !== undefined || updates.model !== undefined) &&
        updates.modelId === undefined
          ? { ...updates, modelId: "" }
          : updates;
      updateSettingsBase(normalizedUpdates);
      scheduleSave();
    },
    [clearSavedIndicator, updateSettingsBase, scheduleSave],
  );

  /**
   * 利用モードを切り替える。モードごとのスナップショットで provider/model/API キーを復元する。
   * Switches interaction mode and restores per-mode snapshots for provider/model/API key.
   */
  const handleModeChange = useCallback(
    (newMode: AIInteractionMode) => {
      updateSettings(buildInteractionModeUpdates(settings, newMode, modeSnapshotsRef));
    },
    [settings, updateSettings],
  );

  const handleTest = useCallback(async () => {
    const result = await test();
    if (result.success) {
      toast({ title: t("aiSettings.connectionSuccess"), description: result.message });
    } else {
      toast({
        title: t("aiSettings.connectionFailed"),
        description: result.message,
        variant: "destructive",
      });
    }
  }, [test, toast, t]);

  const handleReset = useCallback(() => {
    reset();
    clearSavedIndicator();
    toast({
      title: t("aiSettings.resetToast"),
      description: t("aiSettings.resetToastDescription"),
    });
  }, [reset, clearSavedIndicator, toast, t]);

  const handleServerModelSelect = useCallback(
    (modelId: string) => {
      const model = serverModels.find((m) => m.id === modelId);
      if (model) {
        updateSettings({
          provider: model.provider,
          model: model.modelId,
          modelId: model.id,
        });
      }
    },
    [serverModels, updateSettings],
  );

  return {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    savedAt,
    showApiKey,
    setShowApiKey,
    useOwnKey,
    serverModels,
    serverModelsLoading,
    serverModelsError,
    isServerMode,
    isClaudeCode,
    interactionMode,
    claudeCodeAvailable,
    loadServerModels,
    updateSettings,
    handleModeChange,
    handleServerModelSelect,
    handleTest,
    handleReset,
  };
}
