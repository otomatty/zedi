/**
 * GET /api/health — ヘルスチェック
 */
import { Hono } from "hono";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
