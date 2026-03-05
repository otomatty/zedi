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

/** 旧フォントサイズ値から新値へマイグレーション */
const LEGACY_FONT_SIZE_MAP: Record<string, GeneralSettings["editorFontSize"]> = {
  normal: "small",
  large: "medium",
  "x-large": "large",
};

/**
 * 一般設定を読み込む
 */
export function loadGeneralSettings(): GeneralSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_GENERAL_SETTINGS };

    const parsed = JSON.parse(stored) as Partial<GeneralSettings> & {
      editorFontSize?: string;
    };
    const editorFontSize =
      parsed.editorFontSize && LEGACY_FONT_SIZE_MAP[parsed.editorFontSize]
        ? LEGACY_FONT_SIZE_MAP[parsed.editorFontSize]
        : parsed.editorFontSize;
    return {
      ...DEFAULT_GENERAL_SETTINGS,
      ...parsed,
      editorFontSize: (editorFontSize as GeneralSettings["editorFontSize"]) ?? "medium",
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
