import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast as sonnerToast } from "@zedi/ui/components/sonner";
import { useToast } from "@zedi/ui";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import type { StorageSettings } from "@/types/storage";

const SAVED_INDICATOR_MS = 3000;

/**
 *
 */
export function useStorageSettingsForm() {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const {
    settings,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings: updateSettingsBase,
    updateConfig: updateConfigBase,
    save,
    test,
    reset,
  } = useStorageSettings();

  /**
   *
   */
  const [showSecrets, setShowSecrets] = useState(false);
  /**
   *
   */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   *
   */
  const savedAtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   *
   */
  const { toast } = useToast();

  /**
   *
   */
  const runSave = useCallback(async () => {
    /**
     *
     */
    const success = await save();
    if (success) {
      setSavedAt(Date.now());
      if (savedAtTimeoutRef.current) clearTimeout(savedAtTimeoutRef.current);
      savedAtTimeoutRef.current = setTimeout(() => {
        setSavedAt(null);
        savedAtTimeoutRef.current = null;
      }, SAVED_INDICATOR_MS);
    } else {
      sonnerToast.error(t("common.error"), {
        description: t("storageSettings.saveFailedToastDescription"),
      });
    }
  }, [save, t]);

  /**
   *
   */
  const scheduleSave = useDebouncedCallback(runSave, 800);

  /**
   *
   */
  const updateSettings = useCallback(
    (updates: Partial<StorageSettings>) => {
      updateSettingsBase(updates);
      scheduleSave();
    },
    [updateSettingsBase, scheduleSave],
  );

  /**
   *
   */
  const updateConfig = useCallback(
    (updates: Partial<StorageSettings["config"]>) => {
      updateConfigBase(updates);
      scheduleSave();
    },
    [updateConfigBase, scheduleSave],
  );

  /**
   *
   */
  const handleTest = useCallback(async () => {
    /**
     *
     */
    const result = await test();
    if (result.success) {
      toast({
        title: t("storageSettings.connectionSuccess"),
        description: result.message,
      });
    } else {
      toast({
        title: t("storageSettings.connectionFailed"),
        description: result.message,
        variant: "destructive",
      });
    }
  }, [test, toast, t]);

  /**
   *
   */
  const handleReset = useCallback(() => {
    reset();
    toast({
      title: t("storageSettings.resetToast"),
      description: t("storageSettings.resetToastDescription"),
    });
  }, [reset, toast, t]);

  return {
    settings,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    savedAt,
    showSecrets,
    setShowSecrets,
    updateSettings,
    updateConfig,
    handleTest,
    handleReset,
  };
}
