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

/** 旧フォントサイズ値から新値へマイグレーション（新仕様の値は含めない） */
const LEGACY_FONT_SIZE_MAP: Record<string, GeneralSettings["editorFontSize"]> = {
  normal: "small",
  "x-large": "large",
};
const VALID_EDITOR_FONT_SIZES: GeneralSettings["editorFontSize"][] = [
  "small",
  "medium",
  "large",
  "custom",
];

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
    const migrated =
      parsed.editorFontSize && parsed.editorFontSize in LEGACY_FONT_SIZE_MAP
        ? LEGACY_FONT_SIZE_MAP[parsed.editorFontSize]
        : parsed.editorFontSize;
    const editorFontSize = VALID_EDITOR_FONT_SIZES.includes(
      migrated as GeneralSettings["editorFontSize"],
    )
      ? (migrated as GeneralSettings["editorFontSize"])
      : "medium";

    const customFontSizePx =
      typeof parsed.customFontSizePx === "number" && Number.isFinite(parsed.customFontSizePx)
        ? Math.min(24, Math.max(12, parsed.customFontSizePx))
        : undefined;

    return {
      ...DEFAULT_GENERAL_SETTINGS,
      ...parsed,
      editorFontSize,
      customFontSizePx,
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
