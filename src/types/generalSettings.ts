// 一般設定の型定義

export type ThemeMode = "system" | "light" | "dark";

export type EditorFontSize = "normal" | "large" | "x-large";

export type UILocale = "ja" | "en";

export interface GeneralSettings {
  theme: ThemeMode;
  editorFontSize: EditorFontSize;
  locale: UILocale;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  theme: "system",
  editorFontSize: "normal",
  locale: "ja",
};

/** テーマの表示名 */
export const THEME_OPTIONS: { value: ThemeMode; label: string; labelEn: string }[] = [
  { value: "system", label: "システムに従う", labelEn: "System" },
  { value: "light", label: "ライト", labelEn: "Light" },
  { value: "dark", label: "ダーク", labelEn: "Dark" },
];

/** フォントサイズの表示名と対応 px */
export const FONT_SIZE_OPTIONS: {
  value: EditorFontSize;
  label: string;
  labelEn: string;
  px: number;
}[] = [
  { value: "normal", label: "標準", labelEn: "Normal", px: 14 },
  { value: "large", label: "やや大きめ", labelEn: "Large", px: 16 },
  { value: "x-large", label: "大きめ", labelEn: "Extra Large", px: 18 },
];

/** 言語の表示名 */
export const LOCALE_OPTIONS: { value: UILocale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];
