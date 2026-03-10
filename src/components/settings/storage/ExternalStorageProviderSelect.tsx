import { Label } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { EXTERNAL_STORAGE_PROVIDERS } from "@/types/storage";
import type { StorageProviderType } from "@/types/storage";
import { useTranslation } from "react-i18next";
import type { StorageSettingsFormContentProps } from "./storageSettingsFormTypes";

type Props = Pick<
  StorageSettingsFormContentProps,
  | "useExternalStorageEffective"
  | "effectiveProvider"
  | "currentProvider"
  | "updateSettings"
  | "isSaving"
  | "isTesting"
>;

export function ExternalStorageProviderSelect({
  useExternalStorageEffective,
  effectiveProvider,
  currentProvider,
  updateSettings,
  isSaving,
  isTesting,
}: Props) {
  const { t } = useTranslation();
  if (!useExternalStorageEffective) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="provider">{t("storageSettings.externalStorageLabel")}</Label>
      <Select
        value={effectiveProvider}
        onValueChange={(value) => updateSettings({ provider: value as StorageProviderType })}
        disabled={isSaving || isTesting}
      >
        <SelectTrigger id="provider">
          <SelectValue placeholder={t("storageSettings.selectStorage")} />
        </SelectTrigger>
        <SelectContent>
          {EXTERNAL_STORAGE_PROVIDERS.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex flex-col items-start">
                  <span>{t(`storageSettings.providers.${provider.id}.name`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`storageSettings.providers.${provider.id}.description`)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {t("storageSettings.difficultyLabel")}:{" "}
                    {t(`storageSettings.difficulty.${provider.setupDifficulty}`)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`storageSettings.providers.${provider.id}.freeTier`)}
                  </Badge>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentProvider && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {t("storageSettings.difficultyLabel")}:{" "}
            {t(`storageSettings.difficulty.${currentProvider.setupDifficulty}`)}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {t(`storageSettings.providers.${currentProvider.id}.freeTier`)}
          </Badge>
          <span>{t(`storageSettings.providers.${currentProvider.id}.description`)}</span>
        </div>
      )}
    </div>
  );
}
