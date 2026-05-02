// 一般設定の型定義

/** UI テーマ（システム追従またはライト/ダーク）。 / UI theme (system, light, or dark). */
export type ThemeMode = "system" | "light" | "dark";

/** エディタのプリセットまたはカスタム px。 / Editor font size preset or custom px. */
export type EditorFontSize = "small" | "medium" | "large" | "custom";

/** UI 表示言語。 / UI display language. */
export type UILocale = "ja" | "en";

/** 一般設定の永続化フィールド。 / Persisted general settings fields. */
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

/** 初回・リセット時の既定値。 / Defaults for first load and reset. */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  theme: "system",
  editorFontSize: "medium",
  locale: "ja",
  executableCodeConfirmBeforeRun: true,
};

/**
 * テーマ選択の値。表示名は i18n `generalSettings.theme.*`。
 * / Theme options; labels come from i18n `generalSettings.theme.*`.
 */
export const THEME_OPTIONS: { value: ThemeMode }[] = [
  { value: "system" },
  { value: "light" },
  { value: "dark" },
];

/**
 * フォントプリセットと px。表示名は i18n `generalSettings.fontSize.*`。
 * / Font presets; labels from i18n `generalSettings.fontSize.*`.
 */
export const FONT_SIZE_OPTIONS: { value: EditorFontSize; px: number | null }[] = [
  { value: "small", px: 14 },
  { value: "medium", px: 16 },
  { value: "large", px: 18 },
  { value: "custom", px: null },
];

/**
 * 言語の選択肢。表示名は i18n `generalSettings.locales.*`。
 * / Locale options; labels from i18n `generalSettings.locales.*`.
 */
export const LOCALE_OPTIONS: { value: UILocale }[] = [{ value: "ja" }, { value: "en" }];
