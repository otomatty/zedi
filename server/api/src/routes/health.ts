import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
