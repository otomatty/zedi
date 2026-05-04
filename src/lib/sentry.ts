/**
 * Sentry React SDK のフロントエンド初期化。`VITE_SENTRY_DSN_WEB` が
 * 未設定の場合は no-op となり、本番以外の DSN 漏れを防ぐ。
 *
 * Frontend Sentry initialization. No-ops when `VITE_SENTRY_DSN_WEB` is unset
 * so non-production builds don't accidentally ship a DSN.
 *
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/804
 */
import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * Sentry SDK を初期化する。多重呼び出しは無視する。
 * Initializes the Sentry browser SDK. Subsequent calls are ignored.
 *
 * @returns 初期化を実行した場合は true、DSN 未設定や二回目以降は false
 *          / true when init ran, false when skipped
 */
export function initSentry(): boolean {
  if (initialized) return false;
  const dsn = import.meta.env.VITE_SENTRY_DSN_WEB?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // PII（メール・IP 等）の自動付与は禁止する。サーバ側 (`server/api/src/lib/sentry.ts`)
    // と同じポリシーを採る。
    // Disable automatic PII (email/IP) attachment to mirror the server-side policy.
    sendDefaultPii: false,
    // Phase 1 はトレースサンプリングを行わない（必要になれば後続で調整）。
    // Phase 1 leaves performance tracing off; revisit when we need it.
    tracesSampleRate: 0,
    // SPA でのロード負荷を避けるため、デバッグ用の Replay は導入しない。
    // No Session Replay in Phase 1 to keep the bundle small.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });

  initialized = true;
  return true;
}

/**
 * 任意の例外を Sentry に送信するヘルパー。テスト容易性のため Sentry の
 * `captureException` を直接呼ばずにこの関数を経由する。
 *
 * Helper for forwarding caught exceptions to Sentry. Tests can mock this
 * module instead of the entire SDK.
 */
export function captureException(error: unknown): void {
  Sentry.captureException(error);
}

export { Sentry };
