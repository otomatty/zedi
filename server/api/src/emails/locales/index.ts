/**
 * メールテンプレート用ロケール管理
 * Locale management for email templates
 */
import { en } from "./en.js";
import { ja } from "./ja.js";

/** サポートするロケール / Supported locales */
export type Locale = "ja" | "en";

const locales = { ja, en } as const;

/**
 * ロケールに応じた翻訳データを取得する
 * Get translation data for the given locale
 *
 * @param locale - ロケールコード / Locale code
 * @returns 翻訳データ / Translation data
 */
export function getLocale(locale: Locale) {
  return locales[locale] ?? locales.en;
}

export { ja, en };
