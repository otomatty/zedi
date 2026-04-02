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
import type { AISettings } from "@/types/ai";

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

  const useOwnKey = !isLoading && settings.apiMode === "user_api_key";
  const isClaudeCode = settings.provider === "claude-code";
  const isServerMode = settings.apiMode === "api_server" && !useOwnKey && !isClaudeCode;

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

  const handleToggleOwnKey = useCallback(
    (checked: boolean) => {
      updateSettings({ apiMode: checked ? "user_api_key" : "api_server" });
    },
    [updateSettings],
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
    claudeCodeAvailable,
    loadServerModels,
    updateSettings,
    handleToggleOwnKey,
    handleServerModelSelect,
    handleTest,
    handleReset,
  };
}
