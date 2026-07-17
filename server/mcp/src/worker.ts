/**
 * Cloudflare Workers entry for the Zedi MCP server (#1092 / Phase 2).
 * Hono default export — same pattern as `server/api/src/worker.ts`.
 *
 * `ZEDI_API_URL` / `GIT_COMMIT_SHA` は `wrangler.jsonc` の `vars` またはデプロイ時の
 * `--var` で注入され、リクエスト毎に env バインディングから解決される。
 *
 * Zedi MCP サーバーの Cloudflare Workers エントリポイント。
 */
import { createWorkerApp } from "./app.js";

const app = createWorkerApp();

export default app;
