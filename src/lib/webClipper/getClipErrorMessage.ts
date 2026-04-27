/**
 * クリップエラーをユーザー向けメッセージに変換する。
 * Converts clip errors to user-friendly messages.
 */

import i18n from "@/i18n";

/**
 * クリップエラーをユーザーフレンドリーなメッセージに変換する。
 * Converts clip error to a user-friendly message.
 */
export function getClipErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("有効なURL")) {
      return i18n.t("errors.webClipInvalidUrl");
    }
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return i18n.t("errors.webClipNetworkError");
    }
    if (error.message.includes("Request timed out") || error.message.includes("TIMEOUT")) {
      return i18n.t("errors.webClipTimeout");
    }
    if (error.message.includes("本文の抽出")) {
      return i18n.t("errors.webClipExtractFailed");
    }
    if (error.message.includes("プロキシ") || error.message.includes("FETCH_FAILED")) {
      return i18n.t("errors.webClipFetchFailed");
    }
    return i18n.t("errors.webClipGenericError");
  }
  return i18n.t("errors.webClipUnknownError");
}
