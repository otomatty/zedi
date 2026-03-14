/**
 * ISO 8601 形式の日付文字列を日本語ロケールの日付形式に変換する。
 * Converts an ISO 8601 date string to Japanese locale date format.
 *
 * @param iso - ISO 8601 形式の日付文字列 / ISO 8601 date string
 * @returns 日本語形式（YYYY/MM/DD）の日付文字列。不正な入力の場合はそのまま返す。
 *          Date string in Japanese format (YYYY/MM/DD). Returns input as-is for invalid input.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
