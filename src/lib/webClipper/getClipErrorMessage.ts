/**
 * クリップエラーをユーザー向けメッセージに変換する。
 * Converts clip errors to user-friendly messages.
 *
 * 上流のエラー文言は呼び出し元のロケールに依存しないよう、日本語・英語の
 * 両方の代表的なフラグメントとマシン可読トークンの双方をマッチングする。
 * Match both Japanese / English fragments and machine-readable tokens so the
 * upstream message language does not change the classification.
 */

import i18n from "@/i18n";

/**
 * クリップエラーをユーザーフレンドリーなメッセージに変換する。
 * Converts clip error to a user-friendly message.
 */
export function getClipErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("有効なURL") || /valid URL/i.test(msg)) {
      return i18n.t("errors.webClipInvalidUrl");
    }
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return i18n.t("errors.webClipNetworkError");
    }
    if (msg.includes("Request timed out") || msg.includes("TIMEOUT") || /timed? out/i.test(msg)) {
      return i18n.t("errors.webClipTimeout");
    }
    if (msg.includes("本文の抽出") || /extract (content|body)/i.test(msg)) {
      return i18n.t("errors.webClipExtractFailed");
    }
    if (
      msg.includes("プロキシ") ||
      msg.includes("FETCH_FAILED") ||
      /failed to fetch (the )?page|proxy/i.test(msg)
    ) {
      return i18n.t("errors.webClipFetchFailed");
    }
    return i18n.t("errors.webClipGenericError");
  }
  return i18n.t("errors.webClipUnknownError");
}
