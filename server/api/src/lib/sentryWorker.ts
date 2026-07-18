/**
 * Sentry の Workers ランタイム実装（`src/worker.ts` 専用）。
 *
 * `withSentry` ラッパが SDK 初期化と `ctx.waitUntil` によるイベント flush を
 * 保証するため、Workers 側に `initSentry` は存在しない（#1091 LC-4 / OQ-2）。
 * このモジュールを index.ts から import してはならない（Node バンドルに
 * `@sentry/cloudflare` を混ぜない）。
 *
 * Workers-runtime Sentry implementation. The `withSentry` wrapper owns SDK
 * init and waitUntil-based event flushing, so there is no `initSentry` here.
 */
import * as Sentry from "@sentry/cloudflare";
import type { ApiErrorContext } from "./sentryShared.js";

/**
 * API errorHandler から渡された例外を HTTP 情報付きで Sentry に送信する。
 * Node 側 `lib/sentry.ts` の `captureApiException` と同一のタグ/extra 形状。
 * Captures an API exception with the same tag/extra shape as the Node runtime.
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
