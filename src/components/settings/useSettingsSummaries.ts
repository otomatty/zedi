import { useTranslation } from "react-i18next";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useAISettings } from "@/hooks/useAISettings";
import { useStorageSettings } from "@/hooks/useStorageSettings";
import { useProfile } from "@/hooks/useProfile";
import type { StorageProviderType } from "@/types/storage";
import type { SettingsSectionId } from "./SettingsSection";

/** Legacy provider id; normalized to s3 for display (no longer in StorageProviderType). */
const LEGACY_CLOUDFLARE_R2 = "cloudflare-r2";

function effectiveStorageProviderId(provider: string): StorageProviderType {
  return provider === LEGACY_CLOUDFLARE_R2 ? "s3" : (provider as StorageProviderType);
}

/**
 * Builds one-line summaries for each settings section card.
 * 各設定セクションカード向けの 1 行サマリーを生成する。
 */
export function useSettingsSummaries(): Record<SettingsSectionId, string> {
  const { t, i18n } = useTranslation();
  const general = useGeneralSettings();
  const ai = useAISettings();
  const storage = useStorageSettings();
  const { displayName } = useProfile();

  const generalSummary = (): string => {
    if (general.isLoading) return "";
    const themeText = t(`generalSettings.theme.${general.settings.theme}`);
    const fontSizePx = general.editorFontSizePx ?? 16;
    const localeText = t(`generalSettings.locales.${general.settings.locale}`);
    const profileText = displayName
      ? t("settings.summary.general.profileSet")
      : t("settings.summary.general.profileUnset");
    return [
      t("settings.summary.general.theme", { value: themeText }),
      t("settings.summary.general.fontSize", { value: `${fontSizePx}px` }),
      t("settings.summary.general.locale", { value: localeText }),
      profileText,
    ].join(" · ");
  };

  const aiSummary = (): string => {
    if (ai.isLoading) return "";
    const useOwnKey = ai.settings.apiMode === "user_api_key";
    const modeText = useOwnKey
      ? t("settings.summary.ai.ownKeyMode")
      : t("settings.summary.ai.serverMode");
    // api_server モードでは API キー不要のため常に設定済みとして扱う。
    // In api_server mode no API key is required, except for claude-code which
    // still depends on its own local configuration state.
    const effectivelyConfigured =
      ai.settings.isConfigured ||
      (ai.settings.apiMode === "api_server" && ai.settings.provider !== "claude-code");
    const statusText = effectivelyConfigured
      ? t("settings.summary.ai.configured")
      : t("settings.summary.ai.notSet");
    const parts = [modeText, statusText];
    if (ai.settings.modelId) {
      parts.splice(1, 0, t("settings.summary.ai.model", { value: ai.settings.modelId }));
    }
    return parts.join(" · ");
  };

  const storageSummary = (): string => {
    if (storage.isLoading) return "";
    const isLegacyCloudflareR2 = (storage.settings.provider as string) === LEGACY_CLOUDFLARE_R2;
    const useDefault = storage.settings.preferDefaultStorage !== false || isLegacyCloudflareR2;
    const destinationText = useDefault
      ? t("settings.summary.storage.default")
      : t("settings.summary.storage.external", {
          provider: t(
            `storageSettings.providers.${effectiveStorageProviderId(storage.settings.provider)}.name`,
          ),
        });
    let statusText = t("settings.summary.storage.notTested");
    if (storage.testResult) {
      statusText = storage.testResult.success
        ? t("settings.summary.storage.connectionSuccess")
        : t("settings.summary.storage.connectionFailed");
    }
    return `${destinationText} · ${statusText}`;
  };

  return {
    general: generalSummary(),
    ai: aiSummary(),
    storage: storageSummary(),
  };
}
