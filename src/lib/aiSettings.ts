// AI設定の保存/読み込み機能

import { encrypt, decrypt } from "./encryption";
import i18n from "@/i18n";
import { AISettings, DEFAULT_AI_SETTINGS } from "@/types/ai";
import { isTauriDesktop } from "@/lib/platform";

const STORAGE_KEY = "zedi-ai-settings";

/**
 * Same-tab notification after AI settings persist (the `storage` event does not fire on the writer).
 * AI 設定保存後の同一タブ向け通知（書き込み側では `storage` が発火しない）。
 */
export const AI_SETTINGS_CHANGED_EVENT = "zedi-ai-settings-changed";

function dispatchAISettingsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_CHANGED_EVENT));
  }
}

/**
 * AI設定を保存する
 * APIキーは暗号化して保存
 */
export async function saveAISettings(settings: AISettings): Promise<void> {
  try {
    const dataToStore = {
      ...settings,
      // APIキーのみ暗号化
      apiKey: settings.apiKey ? await encrypt(settings.apiKey) : "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    dispatchAISettingsChanged();
  } catch (error) {
    console.error("Failed to save AI settings:", error);
    throw new Error(i18n.t("errors.aiSettingsSaveFailed"));
  }
}

/**
 * AI設定を読み込む
 * 暗号化されたAPIキーを復号化して返す
 * 後方互換性: apiModeがない場合はapi_server（アプリのサーバー経由）をデフォルトとする。
 *
 * Loads AI settings and decrypts the stored API key.
 * Backward compatibility: when apiMode is missing, default to `api_server`
 * so legacy users transparently move to the app-hosted AI endpoint.
 */
export async function loadAISettings(): Promise<AISettings | null> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as AISettings;

    // APIキーを復号化 / Decrypt the stored API key.
    if (parsed.apiKey) {
      parsed.apiKey = await decrypt(parsed.apiKey);
    }

    // 後方互換性: apiModeがない場合はデフォルトでアプリのサーバー経由とする。
    // Backward compatibility: default missing apiMode to the app's server.
    if (!parsed.apiMode) {
      parsed.apiMode = "api_server";
    }

    // 後方互換性: modelIdがない場合はprovider:modelから生成
    if (!parsed.modelId && parsed.model && parsed.provider) {
      parsed.modelId = `${parsed.provider}:${parsed.model}`;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to load AI settings:", error);
    // 復号化に失敗した場合は設定をクリア
    clearAISettings();
    return null;
  }
}

/**
 * AI設定をクリアする
 */
export function clearAISettings(): void {
  localStorage.removeItem(STORAGE_KEY);
  dispatchAISettingsChanged();
}

/**
 * AI設定が有効かどうかを確認する。
 * api_serverモードではシステムプロバイダーが利用可能なため常にtrue。
 * claude-code はデスクトップ環境でインストール済みなら常に利用可能。
 *
 * Checks if AI is configured. Server mode is always available.
 * Claude Code is available when installed in a desktop environment.
 */
export async function isAIConfigured(): Promise<boolean> {
  const settings = await loadAISettings();
  if (!settings) {
    return true;
  }
  if (settings.provider === "claude-code") {
    if (!isTauriDesktop()) return false;
    try {
      const { checkClaudeInstallation } = await import("@/lib/claudeCode/bridge");
      const result = await checkClaudeInstallation();
      return result.installed;
    } catch {
      return false;
    }
  }
  if (settings.apiMode === "api_server") {
    return true;
  }
  return settings.isConfigured;
}

/**
 * デフォルト設定を取得する
 */
export function getDefaultAISettings(): AISettings {
  return { ...DEFAULT_AI_SETTINGS };
}
