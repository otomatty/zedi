import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast as sonnerToast } from "@zedi/ui/components/sonner";
import { useToast } from "@zedi/ui";
import { useAISettings } from "@/hooks/useAISettings";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { fetchServerModels, FetchServerModelsError } from "@/lib/aiService";
import type { AISettings } from "@/types/ai";
import type { AIModel } from "@/types/ai";

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
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [serverModels, setServerModels] = useState<AIModel[]>([]);
  const [serverModelsLoading, setServerModelsLoading] = useState(false);
  const [serverModelsError, setServerModelsError] = useState<string | null>(null);
  const { toast } = useToast();

  const isServerMode = settings.apiMode === "api_server" && !useOwnKey;

  const loadServerModels = useCallback(
    async (forceRefresh = false) => {
      setServerModelsError(null);
      setServerModelsLoading(true);
      try {
        const { models } = await fetchServerModels(forceRefresh);
        setServerModels(models ?? []);
        if (!models?.length) {
          setServerModelsError(t("aiSettings.modelsEmpty"));
        }
      } catch (e) {
        const message =
          e instanceof FetchServerModelsError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setServerModelsError(message);
        setServerModels([]);
      } finally {
        setServerModelsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (isServerMode) {
      loadServerModels();
    }
  }, [isServerMode, loadServerModels]);

  useEffect(() => {
    if (!isLoading) {
      setUseOwnKey(settings.apiMode === "user_api_key");
    }
  }, [isLoading, settings.apiMode]);

  const runSave = useCallback(async () => {
    const success = await save();
    if (success) {
      sonnerToast.success(t("aiSettings.savedToast"), {
        description: t("aiSettings.savedToastDescription"),
      });
      // Do not navigate(returnTo) here: on the settings hub both AI and storage
      // hooks are mounted, so auto-navigate would redirect after first save and
      // cross-contaminate returnTo between sections. Use the hub's back button instead.
    } else {
      sonnerToast.error(t("common.error"), {
        description: t("aiSettings.saveFailedToastDescription"),
      });
    }
  }, [save, t]);

  const scheduleSave = useDebouncedCallback(runSave, 800);

  const updateSettings = useCallback(
    (updates: Partial<AISettings>) => {
      updateSettingsBase(updates);
      scheduleSave();
    },
    [updateSettingsBase, scheduleSave],
  );

  const handleToggleOwnKey = useCallback(
    (checked: boolean) => {
      setUseOwnKey(checked);
      updateSettings({
        apiMode: checked ? "user_api_key" : "api_server",
      });
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
    setUseOwnKey(false);
    toast({
      title: t("aiSettings.resetToast"),
      description: t("aiSettings.resetToastDescription"),
    });
  }, [reset, toast, t]);

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
    showApiKey,
    setShowApiKey,
    useOwnKey,
    serverModels,
    serverModelsLoading,
    serverModelsError,
    isServerMode,
    loadServerModels,
    updateSettings,
    handleToggleOwnKey,
    handleServerModelSelect,
    handleTest,
    handleReset,
  };
}
