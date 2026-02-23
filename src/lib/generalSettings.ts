// 一般設定の保存/読み込み機能（localStorage）

import { GeneralSettings, DEFAULT_GENERAL_SETTINGS } from "@/types/generalSettings";

const STORAGE_KEY = "zedi-general-settings";

/**
 * 一般設定を保存する
 */
export function saveGeneralSettings(settings: GeneralSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save general settings:", error);
    throw new Error("一般設定の保存に失敗しました");
  }
}

/**
 * 一般設定を読み込む
 */
export function loadGeneralSettings(): GeneralSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_GENERAL_SETTINGS };

    const parsed = JSON.parse(stored) as Partial<GeneralSettings>;
    return {
      ...DEFAULT_GENERAL_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.error("Failed to load general settings:", error);
    return { ...DEFAULT_GENERAL_SETTINGS };
  }
}

/**
 * 一般設定をクリアする
 */
export function clearGeneralSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
