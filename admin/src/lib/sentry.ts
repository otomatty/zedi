/**
 * 管理画面 (admin) 用の Sentry React SDK 初期化。
 * `VITE_ADMIN_SENTRY_DSN` が未設定なら no-op で動作する。
 *
 * Sentry initialization for the admin SPA. No-ops when
 * `VITE_ADMIN_SENTRY_DSN` is unset so local dev never reports.
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
  const dsn = import.meta.env.VITE_ADMIN_SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // 管理画面でも PII の自動付与は禁止する（サーバ側と同じポリシー）。
    // Mirror the server-side policy: no automatic PII attachment.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });

  initialized = true;
  return true;
}

/**
 * Sentry へ送る追加コンテキスト（`extra` のみ受け付ける軽量版）。
 * Lightweight subset of Sentry's `CaptureContext` exposed to callers — only
 * `extra` is supported so the helper stays easy to mock in tests.
 */
export interface CaptureExtras {
  extra?: Record<string, unknown>;
}

/**
 * 任意の例外を Sentry に送信するヘルパー。
 * Helper for forwarding caught exceptions to Sentry.
 *
 * @param error - 例外オブジェクト / Caught exception
 * @param context - `{ extra: {...} }` 形式の追加コンテキスト（任意）
 *                  / Optional `{ extra: {...} }` context attached to the event
 */
export function captureException(error: unknown, context?: CaptureExtras): void {
  Sentry.captureException(error, context);
}

export { Sentry };
