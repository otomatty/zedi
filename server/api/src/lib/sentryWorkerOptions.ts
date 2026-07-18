/**
 * Worker 向け Sentry 設定のビルダー（SDK 非依存 — 単体テスト可能）。
 *
 * `withSentry` ラッパ（`sentryWorker.ts`）に渡すオプションを生成する。
 * スクラブ挙動（`sendDefaultPii: false` / `denyUrls` / `beforeSend`）は
 * Node 側 `initSentry()` と同一に保つ（#1091 FR-3.2）。
 *
 * SDK-free builder for the Workers Sentry options passed to `withSentry`.
 * Keeps scrub behavior identical to the Node runtime's `initSentry()`.
 */
import { scrubSentryEvent } from "./sentryShared.js";
import type { ScrubbableSentryEvent } from "./sentryShared.js";

/** `withSentry` に渡すオプションの最小型（SDK の型に構造的に適合する）。 */
export interface WorkerSentryOptions {
  dsn?: string;
  environment: string;
  sendDefaultPii: boolean;
  denyUrls: RegExp[];
  beforeSend: <T extends ScrubbableSentryEvent>(event: T) => T;
}

/**
 * Worker env（bindings + vars + secrets）から Sentry オプションを組み立てる。
 * `SENTRY_DSN_API` が未設定/空なら dsn を undefined にして SDK を no-op にする
 * （FR-3.3 — Node 側の DSN 未設定 no-op と同じ契約）。
 */
export function buildSentryOptions(env: Record<string, unknown>): WorkerSentryOptions {
  const rawDsn = typeof env.SENTRY_DSN_API === "string" ? env.SENTRY_DSN_API.trim() : "";
  const environment = typeof env.ENVIRONMENT === "string" ? env.ENVIRONMENT : "development";
  return {
    dsn: rawDsn || undefined,
    environment,
    sendDefaultPii: false,
    denyUrls: [/\/api\/health(?:$|\?)/],
    beforeSend: (event) => scrubSentryEvent(event),
  };
}
