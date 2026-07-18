/**
 * Node 専用の KvStore ファクトリ配線（#1091 FR-5 のモジュール境界）。
 *
 * `ioredis` への静的 import はこのモジュールだけが持ち、`index.ts` だけが
 * import する。worker.ts が import すると `worker:bundle:check` が fail する。
 *
 * Node-only KvStore factory wiring. This is the single module allowed to
 * import `ioredis`; only the Node entry imports it.
 */
import { Redis } from "ioredis";
import { RedisKvStore } from "./redisKvStore.js";
import { setNodeKvStoreFactory } from "./createKvStore.js";
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

function createNodeKvStore(): KvStore | null {
  const redis = getRedis();
  return redis ? new RedisKvStore(redis) : null;
}

/**
 * Node エントリ起動時に呼び、Redis ベースの KvStore ファクトリを有効化する。
 * Install the ioredis-backed KvStore factory into the runtime-neutral module.
 */
export function installNodeKvStoreFactory(): void {
  setNodeKvStoreFactory(createNodeKvStore);
}
