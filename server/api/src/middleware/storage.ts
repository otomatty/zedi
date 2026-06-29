import { createMiddleware } from "hono/factory";
import { createStorageClient } from "../lib/storage/index.js";
import type { AppEnv } from "../types/index.js";

/**
 * Injects a {@link StorageClient} per request (R2 binding on Workers, S3 env on Node).
 * リクエストごとに {@link StorageClient} を注入（Workers は R2 binding、Node は S3 env）。
 */
export const storageMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("storage", createStorageClient(c.env));
  await next();
});
