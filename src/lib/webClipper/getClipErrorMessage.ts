/**
 * クリップエラーをユーザー向けメッセージに変換する。
 * Converts clip errors to user-friendly messages.
 */

/**
 * クリップエラーをユーザーフレンドリーなメッセージに変換する。
 * Converts clip error to a user-friendly message.
 */
export function getClipErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("有効なURL")) {
      return "有効なURLを入力してください。";
    }
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return "ネットワークエラーが発生しました。接続を確認してください。";
    }
    if (error.message.includes("Request timed out") || error.message.includes("TIMEOUT")) {
      return "取得がタイムアウトしました。しばらくしてから再試行してください。";
    }
    if (error.message.includes("本文の抽出")) {
      return "本文の抽出に失敗しました。このページは対応していない可能性があります。";
    }
    if (error.message.includes("プロキシ") || error.message.includes("FETCH_FAILED")) {
      return "ページの取得に失敗しました。URLを確認してください。";
    }
    return "エラーが発生しました。しばらくしてから再試行してください。";
  }
  return "予期しないエラーが発生しました。";
}
