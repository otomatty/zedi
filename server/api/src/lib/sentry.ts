import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

const FILTERED = "[Filtered]";
const CIRCULAR = "[Circular]";

/**
 * PII を含み得るキー名（小文字）。
 * Lowercased keys whose values are scrubbed regardless of where they appear.
 */
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
 * URL クエリ文字列に含まれる機微な値（`?token=...` 等）を redact する正規表現。
 * Redacts sensitive URL query parameters (e.g., `?token=...`) embedded in string values.
 */
const SENSITIVE_QUERY_PARAM_RE =
  /([?&](?:authorization|cookie|email|password|token|access_token|refresh_token|secret)=)[^&\s]*/gi;

/**
 * Sentry に送る API エラーの補助コンテキスト。
 * Supplemental route context attached to API errors sent to Sentry.
 */
export interface ApiErrorContext {
  method: string;
  /**
   * Hono の matched route pattern（例: `/api/invite/:token`）。
   * 生のリクエストパスを送ると capability token 等が漏れるため、必ずパターン側を渡す。
   *
   * Hono's matched route pattern (e.g., `/api/invite/:token`). The raw request
   * path must not be passed because it may contain capability tokens.
   */
  routePath: string;
}

/**
 * Sentry Node SDK を初期化する。`SENTRY_DSN_API` が未設定の場合は no-op。
 * Initializes the Sentry Node SDK. No-ops when `SENTRY_DSN_API` is not set.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_API?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: false,
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
      routePath: context.routePath,
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

/**
 * Sentry イベントから PII を含み得るフィールドだけを安全にスクラブする。
 *
 * イベント全体を再帰的に再構築すると、`Date` や `RegExp` 等の非 plain object が
 * `{}` に変質したり、循環参照でスタックオーバーフローする恐れがあるため、
 * ここでは PII を含み得る `request` / `user` / `extra` / `tags` / `contexts` /
 * `breadcrumbs[].data` のみを対象にする。
 *
 * Scrubs only the fields of a Sentry event that may contain PII. The full event
 * is left intact to preserve `Date`/`RegExp`/SDK-managed shapes and to avoid
 * stack overflows on circular references.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      ...event.request,
      headers: scrubShallowRecord(event.request.headers),
      data: scrubDeep(event.request.data, new WeakSet()),
      query_string: scrubQueryStringField(event.request.query_string),
      cookies: scrubShallowRecord(event.request.cookies),
    };
  }
  if (event.user) {
    event.user = scrubShallowRecord(event.user) ?? event.user;
  }
  if (event.extra) {
    event.extra = scrubDeep(event.extra, new WeakSet()) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubShallowRecord(event.contexts) ?? event.contexts;
  }
  if (event.tags) {
    event.tags = scrubShallowRecord(event.tags) ?? event.tags;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: breadcrumb.data
        ? (scrubDeep(breadcrumb.data, new WeakSet()) as typeof breadcrumb.data)
        : breadcrumb.data,
    }));
  }
  return event;
}

function scrubShallowRecord<T extends Record<string, unknown> | undefined>(input: T): T;
function scrubShallowRecord(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = FILTERED;
    } else if (typeof value === "string") {
      out[key] = scrubQueryStringField(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function scrubDeep(value: unknown, seen: WeakSet<object>, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return FILTERED;
  if (typeof value === "string") return scrubQueryStringField(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return CIRCULAR;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, seen));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      scrubDeep(entryValue, seen, entryKey),
    ]),
  );
}

function scrubQueryStringField<T>(value: T): T;
function scrubQueryStringField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(SENSITIVE_QUERY_PARAM_RE, `$1${FILTERED}`);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
