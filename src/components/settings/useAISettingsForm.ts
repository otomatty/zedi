import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useAISettings } from "@/hooks/useAISettings";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  useSavedIndicator,
  useClaudeCodeAvailability,
  useServerModels,
} from "./useAISettingsFormHelpers";
import type { AISettings, AIInteractionMode } from "@/types/ai";
import { getInteractionMode } from "@/types/ai";

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
   * 利用モードを切り替える。設定を適切にリセットして保存する。
   * Switches the interaction mode with appropriate settings reset.
   */
  const handleModeChange = useCallback(
    (newMode: AIInteractionMode) => {
      switch (newMode) {
        case "default":
          updateSettings({
            provider: settings.provider === "claude-code" ? "google" : settings.provider,
            apiMode: "api_server",
            apiKey: "",
          });
          break;
        case "user_api_key":
          updateSettings({
            provider: settings.provider === "claude-code" ? "google" : settings.provider,
            apiMode: "user_api_key",
          });
          break;
        case "claude_code":
          updateSettings({
            provider: "claude-code",
            apiMode: "api_server",
            model: "default",
            modelId: "claude-code:default",
          });
          break;
      }
    },
    [settings.provider, updateSettings],
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
