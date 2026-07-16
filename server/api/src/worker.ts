/**
 * Cloudflare Workers entry for the Zedi API (#1091 / Phase 2a).
 * Hono default export — see Hono skill "Adapters".
 *
 * Zedi API の Cloudflare Workers エントリポイント。
 */
import { createApp } from "./app.js";

// Durable Object classes must be exported from the Worker entry so the
// runtime can instantiate them (see wrangler.jsonc `durable_objects`).
export { KvDurableObject } from "./lib/kv/kvDurableObject.js";

const app = createApp();

export default app;
