/**
 * Sentry の Node ランタイム実装（Railway / `src/index.ts` 専用）。
 *
 * スクラブ・capture 判定の純関数は `sentryShared.ts` に分離し、Worker 側
 * （`sentryWorker.ts`, `@sentry/cloudflare`）と共有する。このモジュールを
 * worker.ts から import してはならない（`worker:bundle:check` が
 * `@sentry/node` の不在を検査する — #1091 LC-4）。
 *
 * Node-runtime Sentry implementation. Pure helpers live in `sentryShared.ts`
 * and are shared with the Workers entry; this module must never be imported
 * from worker.ts so `@sentry/node` stays out of the Worker bundle.
 */
import * as Sentry from "@sentry/node";
import { scrubSentryEvent, shouldCaptureApiException } from "./sentryShared.js";
import type { ApiErrorContext } from "./sentryShared.js";

export { scrubSentryEvent, shouldCaptureApiException };
export type { ApiErrorContext };

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
