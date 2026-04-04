// 一般設定の型定義

/**
 *
 */
export type ThemeMode = "system" | "light" | "dark";

/**
 *
 */
export type EditorFontSize = "small" | "medium" | "large" | "custom";

/**
 *
 */
export type UILocale = "ja" | "en";

/**
 *
 */
export interface GeneralSettings {
  theme: ThemeMode;
  editorFontSize: EditorFontSize;
  /** カスタムフォントサイズ（editorFontSize が "custom" のときのみ使用） */
  customFontSizePx?: number;
  locale: UILocale;
  /**
   * When true, show a confirmation dialog before running executable code blocks (Claude Code).
   * true のとき、実行可能コードブロック実行前に確認ダイアログを表示する（Claude Code）。
   */
  executableCodeConfirmBeforeRun?: boolean;
}

export /**
 *
 */
const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  theme: "system",
  editorFontSize: "medium",
  locale: "ja",
  executableCodeConfirmBeforeRun: true,
};

/** テーマの表示名 */
export const THEME_OPTIONS: { value: ThemeMode; label: string; labelEn: string }[] = [
  { value: "system", label: "システムに従う", labelEn: "System" },
  { value: "light", label: "ライト", labelEn: "Light" },
  { value: "dark", label: "ダーク", labelEn: "Dark" },
];

/** フォントサイズの表示名と対応 px（custom は px: null） */
export const FONT_SIZE_OPTIONS: {
  value: EditorFontSize;
  label: string;
  labelEn: string;
  px: number | null;
}[] = [
  { value: "small", label: "小", labelEn: "Small", px: 14 },
  { value: "medium", label: "中", labelEn: "Medium", px: 16 },
  { value: "large", label: "大", labelEn: "Large", px: 18 },
  { value: "custom", label: "カスタム", labelEn: "Custom", px: null },
];

/** 言語の表示名 */
export const LOCALE_OPTIONS: { value: UILocale; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];
