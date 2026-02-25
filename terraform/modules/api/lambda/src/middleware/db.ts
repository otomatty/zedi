/**
 * DB ミドルウェア — Drizzle ORM クライアントを Context にセット
 */
import { createMiddleware } from "hono/factory";
import { getDb } from "../db/client";
import type { AppEnv } from "../types";

export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", getDb());
  await next();
});
