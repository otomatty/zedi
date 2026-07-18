/**
 * Cloudflare Workers entry for the Zedi API (#1091).
 *
 * Zedi API の Cloudflare Workers エントリポイント。
 *
 * - agent 系ルート（compose-sessions / ingest）は登録しない — `appAgents.ts` は
 *   Node エントリ専用で、`@langchain/*` / `src/agents/**` を Worker バンドルから
 *   物理的に除外する（FR-1。`worker:bundle:check` が不在を検査する）。
 * - Sentry は `withSentry` ラッパで default export を包む。ラッパが SDK 初期化と
 *   `ctx.waitUntil` によるイベント flush を保証する（LC-4 / OQ-2）。DSN 未設定時は
 *   no-op（FR-3.3）。
 * - `KvDurableObject` の named export は `withSentry` の影響を受けない
 *   （wrangler.jsonc `durable_objects` が参照）。
 */
import { withSentry } from "@sentry/cloudflare";
import { createApp } from "./app.js";
import { captureApiException } from "./lib/sentryWorker.js";
import { buildSentryOptions } from "./lib/sentryWorkerOptions.js";

// Durable Object classes must be exported from the Worker entry so the
// runtime can instantiate them (see wrangler.jsonc `durable_objects`).
export { KvDurableObject } from "./lib/kv/kvDurableObject.js";

const app = createApp({ captureApiException });

export default withSentry((env: Record<string, unknown>) => buildSentryOptions(env), app);
