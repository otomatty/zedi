/**
 * Zedi REST API 呼び出しの正規化エラー
 *
 * すべての HTTP 4xx/5xx 応答および fetch 自体の失敗 (ネットワークエラー) を
 * `ZediApiError` にまとめる。MCP ツール側はこれを `isError: true` の応答に変換する。
 *
 * 429 (レート制限) は `isRateLimit` / `retryAfterSec` を立てて付加情報を持たせる。
 * `Retry-After` ヘッダもしくはレスポンス本文の `retry_after` を数秒単位で取り出す。
 *
 * Normalized error class for Zedi REST API calls; MCP tools convert this to
 * error responses. 429 responses are tagged with `isRateLimit` and an optional
 * `retryAfterSec` so callers can render a useful message to end users.
 */
export class ZediApiError extends Error {
  /**
   * HTTP 429 で、サーバから提案された再試行秒数を取り出せたかどうか。
   * Whether this error represents a rate limit rejection.
   */
  public readonly isRateLimit: boolean;

  /**
   * 429 時の再試行までの秒数 (サーバから得られた場合)。
   * Suggested retry delay in seconds, if available.
   */
  public readonly retryAfterSec: number | null;

  /**
   * 新しい ZediApiError を生成する。Constructs a new ZediApiError.
   *
   * @param status - HTTP ステータスコード (ネットワーク失敗時は 0)。
   * @param message - サーバーからのメッセージ、もしくは fetch 失敗の説明。
   * @param body - サーバー応答本文 (パース可能なら JSON、不可なら文字列)。デバッグ用途。
   * @param retryAfterSec - 429 応答に含まれていた再試行秒数 (オプション)。
   */
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
    retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = "ZediApiError";
    this.isRateLimit = status === 429;
    this.retryAfterSec = retryAfterSec;
  }
}
