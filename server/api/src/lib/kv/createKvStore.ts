/**
 * createKvStore — ランタイムに応じた KvStore の生成 (#1093)
 *
 * Workers では `KV_DO` binding（Durable Object）、Node/Railway では `REDIS_URL`
 * から生成する。どちらも無い場合は null（レート制限等は graceful degradation）。
 *
 * Creates a KvStore for the current runtime: the `KV_DO` Durable Object
 * binding on Workers, an ioredis client from `REDIS_URL` on Node/Railway,
 * or null when neither is configured (callers degrade gracefully).
 */
import { Redis } from "ioredis";
import type { CloudflareBindings } from "../../types/cloudflare.js";
import { DurableObjectKvStore } from "./doKvStore.js";
import { RedisKvStore } from "./redisKvStore.js";
import type { KvStore } from "./types.js";

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  _redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  _redis.connect().catch((err) => {
    console.error("[Redis] Connection failed:", err);
    _redis = null;
  });
  return _redis;
}

/**
 * 現在のランタイム向けの {@link KvStore} を返す。未設定なら null。
 * Returns a {@link KvStore} for the current runtime, or null when unconfigured.
 */
export function createKvStore(bindings?: Partial<CloudflareBindings>): KvStore | null {
  if (bindings?.KV_DO) {
    return new DurableObjectKvStore(bindings.KV_DO);
  }
  const redis = getRedis();
  return redis ? new RedisKvStore(redis) : null;
}
