import { createMiddleware } from "hono/factory";
import { Redis } from "ioredis";
import type { AppEnv } from "../types/index.js";

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

export const redisMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const redis = getRedis();
  if (redis) {
    c.set("redis", redis);
  }
  await next();
});

export function getRedisInstance(): Redis | null {
  return getRedis();
}
