import React from "react";
import { Loader2, Trash2, Image } from "lucide-react";
import { Button } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@zedi/ui";
import { useStorageSettingsForm } from "./useStorageSettingsForm";
import { SectionSaveStatus } from "./SectionSaveStatus";
import { getStorageProviderById, STORAGE_PROVIDERS } from "@/types/storage";
import { useTranslation } from "react-i18next";
import { StorageSettingsFormContent } from "./StorageSettingsFormContent";

interface StorageSettingsFormProps {
  /** When true, used inside settings hub; section title/description are provided by parent */
  embedded?: boolean;
}

/**
 * Storage settings form. Manages image storage provider and credentials.
 * ストレージ設定フォーム。画像ストレージプロバイダーと認証情報を管理する。
 */
export const StorageSettingsForm: React.FC<StorageSettingsFormProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const {
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
  } = useStorageSettingsForm();

  const saveStatus = isSaving ? "saving" : savedAt != null ? "saved" : "idle";
  const useExternalStorage = settings.preferDefaultStorage === false;
  const isLegacyCloudflareR2 = (settings.provider as string) === "cloudflare-r2";
  const effectiveProvider = isLegacyCloudflareR2 ? "s3" : settings.provider;
  const useExternalStorageEffective = useExternalStorage && !isLegacyCloudflareR2;
  const currentProvider =
    getStorageProviderById(useExternalStorageEffective ? effectiveProvider : "s3") ??
    STORAGE_PROVIDERS[0];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {!embedded && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            {t("storageSettings.title")}
          </CardTitle>
          <CardDescription>{t("storageSettings.description")}</CardDescription>
        </CardHeader>
      )}

      <CardContent className={embedded ? "space-y-6 pt-0" : "space-y-6"}>
        {embedded && saveStatus !== "idle" && <SectionSaveStatus status={saveStatus} />}
        <StorageSettingsFormContent
          useExternalStorage={useExternalStorage}
          useExternalStorageEffective={useExternalStorageEffective}
          effectiveProvider={effectiveProvider}
          settings={settings}
          currentProvider={currentProvider}
          showSecrets={showSecrets}
          setShowSecrets={setShowSecrets}
          updateSettings={updateSettings}
          updateConfig={updateConfig}
          isSaving={isSaving}
          isTesting={isTesting}
          testResult={testResult}
        />
      </CardContent>

      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isSaving || isTesting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("common.reset")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("storageSettings.resetConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("storageSettings.resetConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>{t("common.reset")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={isSaving || isTesting}>
            {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("storageSettings.testConnection")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
