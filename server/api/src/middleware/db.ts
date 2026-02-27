import { createMiddleware } from "hono/factory";
import { getDb } from "../db/client.js";
import type { AppEnv } from "../types/index.js";

export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", getDb());
  await next();
});
