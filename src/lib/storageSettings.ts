// ストレージ設定の保存/読み込み機能

import { encrypt, decrypt } from "./encryption";
import { StorageSettings, DEFAULT_STORAGE_SETTINGS } from "@/types/storage";

const STORAGE_KEY = "zedi-storage-settings";

/**
 * 暗号化が必要なフィールドのリスト
 */
const SENSITIVE_FIELDS = [
  "googleDriveClientSecret",
  "googleDriveAccessToken",
  "googleDriveRefreshToken",
  "imgurClientId",
  "r2AccessKeyId",
  "r2SecretAccessKey",
  "githubToken",
] as const;

/**
 * ストレージ設定を保存する
 * 認証情報は暗号化して保存
 */
export async function saveStorageSettings(
  settings: StorageSettings
): Promise<void> {
  try {
    // 認証情報を暗号化したコピーを作成
    const configToStore = { ...settings.config };

    for (const field of SENSITIVE_FIELDS) {
      const value = configToStore[field as keyof typeof configToStore];
      if (value && typeof value === "string") {
        (configToStore as Record<string, string>)[field] = await encrypt(value);
      }
    }

    const dataToStore = {
      ...settings,
      config: configToStore,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
  } catch (error) {
    console.error("Failed to save storage settings:", error);
    throw new Error("ストレージ設定の保存に失敗しました");
  }
}

/**
 * ストレージ設定を読み込む
 * 暗号化された認証情報を復号化して返す
 */
export async function loadStorageSettings(): Promise<StorageSettings | null> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StorageSettings;

    // 認証情報を復号化
    const config = { ...parsed.config };

    for (const field of SENSITIVE_FIELDS) {
      const value = config[field as keyof typeof config];
      if (value && typeof value === "string") {
        try {
          (config as Record<string, string>)[field] = await decrypt(value);
        } catch {
          // 復号化に失敗した場合はフィールドをクリア
          console.warn(`Failed to decrypt field: ${field}`);
          delete (config as Record<string, unknown>)[field];
        }
      }
    }

    return {
      ...parsed,
      config,
    };
  } catch (error) {
    console.error("Failed to load storage settings:", error);
    // 復号化に失敗した場合は設定をクリア
    clearStorageSettings();
    return null;
  }
}

/**
 * ストレージ設定をクリアする
 */
export function clearStorageSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * ストレージ設定が有効かどうかを確認する
 */
export async function isStorageConfigured(): Promise<boolean> {
  const settings = await loadStorageSettings();
  return settings?.isConfigured ?? false;
}

/**
 * デフォルト設定を取得する
 */
export function getDefaultStorageSettings(): StorageSettings {
  return { ...DEFAULT_STORAGE_SETTINGS, config: {} };
}
