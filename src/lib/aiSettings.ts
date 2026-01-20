// AI設定の保存/読み込み機能

import { encrypt, decrypt } from "./encryption";
import { AISettings, DEFAULT_AI_SETTINGS } from "@/types/ai";

const STORAGE_KEY = "zedi-ai-settings";

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
  } catch (error) {
    console.error("Failed to save AI settings:", error);
    throw new Error("AI設定の保存に失敗しました");
  }
}

/**
 * AI設定を読み込む
 * 暗号化されたAPIキーを復号化して返す
 * 後方互換性: apiModeがない場合は自動判定
 */
export async function loadAISettings(): Promise<AISettings | null> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as AISettings;

    // APIキーを復号化（後方互換性判定の前に復号化）
    if (parsed.apiKey) {
      parsed.apiKey = await decrypt(parsed.apiKey);
    }

    // 後方互換性: apiModeがない場合は自動判定（復号化後）
    if (!parsed.apiMode) {
      // apiKeyが設定されている場合はuser_api_key、そうでなければapi_server
      parsed.apiMode = parsed.apiKey.trim() !== "" ? "user_api_key" : "api_server";
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
}

/**
 * AI設定が有効かどうかを確認する
 */
export async function isAIConfigured(): Promise<boolean> {
  const settings = await loadAISettings();
  return settings?.isConfigured ?? false;
}

/**
 * デフォルト設定を取得する
 */
export function getDefaultAISettings(): AISettings {
  return { ...DEFAULT_AI_SETTINGS };
}
