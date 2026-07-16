import { createMiddleware } from "hono/factory";
import { createKvStore } from "../lib/kv/index.js";
import type { AppEnv } from "../types/index.js";

/**
 * リクエストごとに {@link KvStore} を注入する（Workers は KV_DO binding、Node は REDIS_URL）。
 * 未設定時は注入せず、レート制限等は graceful degradation とする（旧 redisMiddleware と同様）。
 *
 * Injects a {@link KvStore} per request (KV_DO Durable Object binding on
 * Workers, REDIS_URL-backed Redis on Node). Skips injection when neither is
 * configured so consumers degrade gracefully, matching the old redisMiddleware.
 */
export const kvMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const kv = createKvStore(c.env);
  if (kv) {
    c.set("kv", kv);
  }
  await next();
});
