/**
 * Sentry まわりのランタイム中立な純関数（SDK 非依存）。
 *
 * `@sentry/node`（Node/Railway）と `@sentry/cloudflare`（Worker）の両方から
 * 使うため、SDK を import しない。Worker バンドルに `@sentry/node` を入れない
 * ためのモジュール境界（#1091 LC-4）。
 *
 * Runtime-neutral Sentry helpers shared by the Node and Workers entries.
 * Imports no SDK so the Worker bundle stays free of `@sentry/node`.
 */

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
 * `captureApiException` と同型の capture 関数。エントリポイント（index.ts /
 * worker.ts）が各ランタイムの SDK 実装を注入する。
 * Capture function shape injected by the runtime entrypoints.
 */
export type ApiExceptionCapture = (err: unknown, status: number, context: ApiErrorContext) => void;

/**
 * `scrubSentryEvent` が触るフィールドだけの構造型。両 SDK の `ErrorEvent` が
 * 構造的に満たすため、SDK の型 import を不要にする。
 * Structural subset of both SDKs' `ErrorEvent`; keeps this module SDK-free.
 */
export interface ScrubbableSentryEvent {
  request?: {
    url?: string;
    headers?: Record<string, unknown>;
    data?: unknown;
    query_string?: unknown;
    cookies?: Record<string, unknown>;
  };
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: { data?: Record<string, unknown> }[];
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
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  if (event.request) {
    event.request = {
      ...event.request,
      url: scrubRequestUrl(event.request.url),
      headers: scrubShallowRecord(event.request.headers),
      data: scrubDeep(event.request.data, new WeakSet()),
      query_string: scrubQueryStringField(event.request.query_string),
      cookies: scrubCookies(event.request.cookies),
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

/**
 * `new URL(relative)` が失敗する場合のみ使う合成オリジン。
 * Synthetic origin used only when `new URL(absolute)` fails for SDK-recorded paths.
 */
const RELATIVE_REQUEST_URL_BASE = "https://sentry-request-url-scrub.invalid";

/**
 * SDK が記録するリクエスト URL からクエリと不透明パス成分を落とす。
 * matched route は `routePath` など別チャネルに載せる前提。
 *
 * Strip query strings and redact opaque path segments from the raw URL SDKs
 * record; structured routing context belongs in `routePath` / extras instead.
 *
 * 相対パス（例: `/api/pages/...`）もパースできるよう合成ベースで解決する。
 * Relative paths (e.g. `/api/pages/...`) are resolved against a synthetic base so
 * scrubbing still applies instead of collapsing everything to `[Filtered]`.
 */
function scrubRequestUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  if (typeof url !== "string") return undefined;
  if (url.length === 0) return "";

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    try {
      u = new URL(url, `${RELATIVE_REQUEST_URL_BASE}/`);
    } catch {
      return FILTERED;
    }
  }

  u.search = "";
  const segments = u.pathname.split("/").map((seg) => {
    if (seg.length === 0) return seg;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
      return "[uuid]";
    }
    if (/^[A-Za-z0-9._~-]{24,}$/.test(seg)) {
      return FILTERED;
    }
    return seg;
  });
  u.pathname = segments.join("/") || "/";
  return u.toString();
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

function scrubCookies(
  input: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.keys(input).map((key) => [key, FILTERED]));
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
