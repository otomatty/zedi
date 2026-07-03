import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import { captureApiException, shouldCaptureApiException } from "../lib/sentry.js";
import type { AppEnv } from "../types/index.js";

/**
 * Hono のグローバルエラーハンドラ。HTTP 応答へ変換し、対象エラーのみ Sentry に送る。
 * Global Hono error handler. Converts thrown errors to HTTP responses and captures eligible errors in Sentry.
 */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err.message);
    if (shouldCaptureApiException(status)) {
      captureApiException(err, status, {
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
    captureApiException(err, status, {
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
