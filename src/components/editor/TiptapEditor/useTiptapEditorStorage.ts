import { useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { useLocation, useNavigate } from "react-router-dom";
import { getStorageProviderById } from "@/types/storage";
import { useAuth } from "@/hooks/useAuth";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { isStorageConfiguredForUpload, getSettingsForUpload } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { extractFirstImage } from "@/lib/contentUtils";
import { useStorageActions } from "./useStorageActions";
import { useThumbnailCommit } from "./useThumbnailCommit";

export function useStorageController(
  content: string,
  storageSettings: ReturnType<typeof useStorageSettings>["settings"],
  isStorageLoading: boolean,
) {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const uploadSettings = getSettingsForUpload(storageSettings);
  const isStorageConfigured = !isStorageLoading && isStorageConfiguredForUpload(storageSettings);
  const currentStorageProvider = getStorageProviderById(uploadSettings.provider);
  const hasThumbnail = useMemo(() => Boolean(extractFirstImage(content)), [content]);

  const { getProviderLabel, handleCopyImageUrl, canDeleteFromStorage, handleDeleteFromStorage } =
    useStorageActions({
      storageSettings,
      isStorageConfigured,
      currentStorageProvider,
      toast,
      getToken,
    });

  return {
    toast,
    isStorageConfigured,
    hasThumbnail,
    getProviderLabel,
    handleCopyImageUrl,
    canDeleteFromStorage,
    handleDeleteFromStorage,
  };
}

export function useStorageDialogState() {
  const [storageSetupDialogOpen, setStorageSetupDialogOpen] = useState(false);
  const openStorageSetupDialog = useCallback(() => setStorageSetupDialogOpen(true), []);
  return { storageSetupDialogOpen, setStorageSetupDialogOpen, openStorageSetupDialog };
}

export function useStorageSettingsNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleGoToStorageSettings = useCallback(() => {
    const returnTo = `${location.pathname}${location.search}`;
    navigate(`/settings/storage?${new URLSearchParams({ returnTo }).toString()}`);
  }, [location.pathname, location.search, navigate]);

  return { handleGoToStorageSettings };
}

export function useThumbnailController(
  editorRef: RefObject<Editor | null>,
  pageTitle: string,
  storageSettings: ReturnType<typeof useStorageSettings>["settings"],
) {
  return useThumbnailCommit({ editorRef, pageTitle, storageSettings });
}

export function useTiptapEditorStorageFeatures(content: string) {
  const { settings: storageSettings, isLoading: isStorageLoading } = useStorageSettings();
  const { storageSetupDialogOpen, setStorageSetupDialogOpen, openStorageSetupDialog } =
    useStorageDialogState();
  const { handleGoToStorageSettings } = useStorageSettingsNavigation();
  const storageController = useStorageController(content, storageSettings, isStorageLoading);

  return {
    storageSettings,
    isStorageLoading,
    storageSetupDialogOpen,
    setStorageSetupDialogOpen,
    openStorageSetupDialog,
    handleGoToStorageSettings,
    ...storageController,
  };
}
