import i18n from "@/i18n";

/**
 * 現在の i18n 言語に対応する BCP 47 ロケールタグを返す。
 * 日本語以外は `en-US` にフォールバックする（将来言語追加時の保守性のため）。
 *
 * Returns a BCP 47 locale tag matching the current i18n language.
 * Falls back to `en-US` for any non-`ja` language so adding new locales later
 * does not silently render Japanese.
 */
export function getActiveLocale(): "ja-JP" | "en-US" {
  const lang = i18n.language?.split("-")[0];
  if (lang === "ja") return "ja-JP";
  return "en-US";
}

/**
 * ISO 8601 形式の日付文字列を、現在の i18n ロケールに合わせた日付形式に変換する。
 * Converts an ISO 8601 date string to a date format matching the active i18n locale.
 *
 * @param iso - ISO 8601 形式の日付文字列 / ISO 8601 date string
 * @returns ロケール依存の日付文字列。不正な入力の場合はそのまま返す。
 *          Locale-formatted date string. Returns input as-is for invalid input.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(getActiveLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 数値を現在の i18n ロケールの慣習で整形する（桁区切りなど）。
 * Formats a number using the active i18n locale (thousand separators, etc.).
 *
 * @param value - 数値 / numeric value
 * @returns ロケール依存の数値文字列 / locale-formatted number string
 */
export function formatNumber(value: number): string {
  return value.toLocaleString(getActiveLocale());
}
