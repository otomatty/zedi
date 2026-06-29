/**
 * Cloudflare Workers entry for the Zedi API (#1091 / Phase 2a).
 * Hono default export — see Hono skill "Adapters".
 *
 * Zedi API の Cloudflare Workers エントリポイント。
 */
import { createApp } from "./app.js";

const app = createApp();

export default app;
