import { Label } from "@zedi/ui";
import { Switch } from "@zedi/ui";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { StorageSettingsFormContentProps } from "./storageSettingsFormTypes";

type Props = Pick<
  StorageSettingsFormContentProps,
  "useExternalStorage" | "useExternalStorageEffective" | "updateSettings" | "isSaving" | "isTesting"
>;

export function StorageDestinationSection({
  useExternalStorage,
  useExternalStorageEffective,
  updateSettings,
  isSaving,
  isTesting,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="prefer-default" className="text-base">
            {t("storageSettings.storageDestination")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {useExternalStorage
              ? t("storageSettings.saveToExternal")
              : t("storageSettings.saveToDefault")}
          </p>
        </div>
        <Switch
          id="prefer-default"
          checked={useExternalStorage}
          onCheckedChange={(checked) => updateSettings({ preferDefaultStorage: !checked })}
          disabled={isSaving || isTesting}
        />
      </div>
      {!useExternalStorageEffective && (
        <Alert>
          <AlertTitle>{t("storageSettings.defaultStorageAlertTitle")}</AlertTitle>
          <AlertDescription>{t("storageSettings.defaultStorageAlertDescription")}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
