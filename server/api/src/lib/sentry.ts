import * as Sentry from "@sentry/bun";
import type { ErrorEvent } from "@sentry/bun";

const FILTERED = "[Filtered]";
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "email",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "set-cookie",
]);

/**
 * Sentry に送る API エラーの補助コンテキスト。
 * Supplemental route context attached to API errors sent to Sentry.
 */
export interface ApiErrorContext {
  method: string;
  path: string;
}

/**
 * Sentry Bun SDK を初期化する。`SENTRY_DSN_API` が未設定の場合は no-op。
 * Initializes the Sentry Bun SDK. No-ops when `SENTRY_DSN_API` is not set.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_API?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    denyUrls: [/\/api\/health(?:$|\?)/],
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

/**
 * API errorHandler から渡された例外を HTTP 情報付きで Sentry に送信する。
 * Captures an API exception with HTTP status and route context.
 */
export function captureApiException(err: unknown, status: number, context: ApiErrorContext): void {
  Sentry.captureException(err, {
    tags: { httpStatus: String(status) },
    extra: {
      method: context.method,
      path: context.path,
    },
  });
}

/**
 * Sentry に送るべき API エラーかどうかを判定する。
 * Returns whether an API error should be sent to Sentry.
 */
export function shouldCaptureApiException(status: number): boolean {
  return status >= 500 || (status >= 400 && status < 500 && ![401, 403, 404].includes(status));
}

function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return scrubValue(event) as ErrorEvent;
}

function scrubValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return FILTERED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      scrubValue(entryValue, entryKey),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
