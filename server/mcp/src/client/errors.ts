/**
 * Zedi REST API 呼び出しの正規化エラー
 *
 * すべての HTTP 4xx/5xx 応答および fetch 自体の失敗 (ネットワークエラー) を
 * `ZediApiError` にまとめる。MCP ツール側はこれを `isError: true` の応答に変換する。
 *
 * Normalized error class for Zedi REST API calls; MCP tools convert this to error responses.
 */
export class ZediApiError extends Error {
  /**
   * 新しい ZediApiError を生成する。Constructs a new ZediApiError.
   *
   * @param status - HTTP ステータスコード (ネットワーク失敗時は 0)。
   * @param message - サーバーからのメッセージ、もしくは fetch 失敗の説明。
   * @param body - サーバー応答本文 (パース可能なら JSON、不可なら文字列)。デバッグ用途。
   */
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ZediApiError";
  }
}
