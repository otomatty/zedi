import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import { shouldCaptureApiException } from "../lib/sentryShared.js";
import type { ApiExceptionCapture } from "../lib/sentryShared.js";
import type { AppEnv } from "../types/index.js";

/**
 * {@link createErrorHandler} のオプション。
 * Options for {@link createErrorHandler}.
 */
export interface ErrorHandlerOptions {
  /**
   * 捕捉対象エラーを送信する capture 関数。エントリポイントがランタイムごとの
   * Sentry 実装を注入する（index.ts → @sentry/node、worker.ts →
   * @sentry/cloudflare）。未注入なら no-op（#1091 LC-4 の DI 境界）。
   */
  captureApiException?: ApiExceptionCapture;
}

/**
 * Hono のグローバルエラーハンドラを生成する。HTTP 応答へ変換し、対象エラーのみ
 * 注入された capture へ渡す。SDK を静的 import しないことで Worker バンドルに
 * `@sentry/node` が入らないようにする。
 *
 * Build the global Hono error handler. Converts thrown errors to HTTP
 * responses and forwards eligible errors to the injected capture function.
 * No SDK is imported statically so the Worker bundle stays SDK-free.
 */
/**
 * capture なしの既定ハンドラ。ルート単体テストや capture 不要のマウントで使う。
 * Default handler without capture — for per-route tests and capture-free mounts.
 */
export const errorHandler: ErrorHandler<AppEnv> = createErrorHandler();

export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandler<AppEnv> {
  const capture: ApiExceptionCapture = options.captureApiException ?? (() => {});

  return (err, c) => {
    if (err instanceof HTTPException) {
      const status = err.status;
      console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err.message);
      if (shouldCaptureApiException(status)) {
        capture(err, status, {
          method: c.req.method,
          routePath: c.req.routePath,
        });
      }
      return c.json({ error: err.message }, status);
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    const statusMap: Record<string, number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      RATE_LIMIT_EXCEEDED: 429,
      STORAGE_QUOTA_EXCEEDED: 403,
      NOT_FOUND: 404,
      BAD_REQUEST: 400,
      CONFLICT: 409,
      VALIDATION_FAILED: 422,
    };
    const status = statusMap[message] ?? 500;

    console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err);
    if (shouldCaptureApiException(status)) {
      capture(err, status, {
        method: c.req.method,
        routePath: c.req.routePath,
      });
    }
    // 5xx では DB/内部の生メッセージ（スキーマ名・接続先など）をクライアントへ露出しない。
    // statusMap で明示された 4xx コードのみ、そのままレスポンスに載せる。
    // Never leak raw internal/DB error messages on 5xx; only the mapped 4xx codes are safe to return.
    const responseMessage = status >= 500 ? "Internal server error" : message;
    return c.json({ error: responseMessage }, status as ContentfulStatusCode);
  };
}
