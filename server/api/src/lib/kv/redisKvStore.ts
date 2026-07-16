/**
 * RedisKvStore — ioredis を KvStore に適合させるアダプタ (#1093)
 *
 * Railway (Node) ランタイム用。既存の invite / extAuth / mcpAuth で使われていた
 * Lua スクリプト（GET+DEL、INCR+EXPIRE-on-create）をここに集約する。
 *
 * ioredis-backed KvStore adapter for the Node/Railway runtime. Centralises the
 * Lua scripts previously scattered across invite / extAuth / mcpAuth.
 */
import type { Redis } from "ioredis";
import type { KvStore } from "./types.js";

/**
 * GET+DEL を 1 往復で原子的に行う（GETDEL 非対応の Redis 向けフォールバック）。
 * Atomic GET+DEL fallback for Redis servers without native GETDEL (< 6.2).
 */
const GETDEL_SCRIPT = `
  local v = redis.call('GET', KEYS[1])
  if v then redis.call('DEL', KEYS[1]); return v; end
  return nil
`;

/**
 * INCR し、新規作成時のみ EXPIRE を付与する（固定ウィンドウ）。
 * TTL を毎回更新するとウィンドウ境界をずらせてしまうため、作成時のみ設定する。
 *
 * Atomic INCR with EXPIRE-on-create. Refreshing the TTL on every call would
 * let callers slide the window boundary, so the TTL is set only on creation.
 */
const INCR_WITH_EXPIRE_ON_CREATE =
  "local c = redis.call('incr', KEYS[1]); if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return c";

/**
 * ioredis クライアントをラップする {@link KvStore} 実装。
 * {@link KvStore} implementation wrapping an ioredis client.
 */
export class RedisKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  /** GET をそのまま委譲する。 / Delegates to Redis GET. */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /** SETEX をそのまま委譲する。 / Delegates to Redis SETEX. */
  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    await this.redis.setex(key, ttlSec, value);
  }

  /**
   * ネイティブ GETDEL を優先し、無ければ Lua で原子的に GET+DEL する。
   * Prefers native GETDEL, falling back to an atomic Lua GET+DEL.
   */
  async getdel(key: string): Promise<string | null> {
    const maybeGetdel = (this.redis as { getdel?: (k: string) => Promise<string | null> }).getdel;
    if (typeof maybeGetdel === "function") {
      return maybeGetdel.call(this.redis, key);
    }
    const result = await this.redis.eval(GETDEL_SCRIPT, 1, key);
    return typeof result === "string" ? result : null;
  }

  /**
   * INCR + EXPIRE-on-create を Lua 1 往復で原子的に実行する。
   * Runs the atomic INCR + EXPIRE-on-create Lua script in one round-trip.
   */
  async incrWithTtl(key: string, ttlSec: number): Promise<number> {
    const result = await this.redis.eval(INCR_WITH_EXPIRE_ON_CREATE, 1, key, String(ttlSec));
    if (typeof result === "number") return result;
    if (typeof result === "string") {
      const parsed = Number.parseInt(result, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  /**
   * 残 TTL を秒で返す。キー不在 (-2) / TTL 無し (-1) は null に正規化する。
   * Returns the remaining TTL in seconds, normalising -2/-1 sentinels to null.
   */
  async ttl(key: string): Promise<number | null> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : null;
  }
}
