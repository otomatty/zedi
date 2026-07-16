/**
 * RedisKvStore のユニットテスト (#1093)
 *
 * ioredis を KvStore インターフェースに適合させるアダプタの検証。
 * - getdel: ネイティブ GETDEL を優先し、無ければ Lua で原子的に GET+DEL
 * - incrWithTtl: INCR + EXPIRE-on-create を Lua 1 往復で原子的に実行
 * - ttl: 残 TTL を秒で返し、キー不存在 (-2) / TTL 無し (-1) は null
 *
 * Unit tests for the ioredis-backed KvStore adapter.
 */
import { describe, it, expect, vi } from "vitest";
import type { Redis } from "ioredis";
import { RedisKvStore } from "../../../lib/kv/redisKvStore.js";

describe("RedisKvStore", () => {
  it("get / setex delegate to the underlying client", async () => {
    const redis = {
      get: vi.fn(async () => "stored"),
      setex: vi.fn(async () => "OK"),
    } as unknown as Redis;
    const kv = new RedisKvStore(redis);

    expect(await kv.get("k")).toBe("stored");
    expect(redis.get).toHaveBeenCalledWith("k");

    await kv.setex("k", 300, "v");
    expect(redis.setex).toHaveBeenCalledWith("k", 300, "v");
  });

  it("getdel uses native GETDEL when available", async () => {
    const redis = {
      getdel: vi.fn(async () => "value"),
      eval: vi.fn(),
    } as unknown as Redis;
    const kv = new RedisKvStore(redis);

    expect(await kv.getdel("k")).toBe("value");
    expect(redis.getdel).toHaveBeenCalledWith("k");
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("getdel falls back to an atomic Lua GET+DEL without native GETDEL", async () => {
    const evalMock = vi.fn(async () => "value");
    const redis = { eval: evalMock } as unknown as Redis;
    const kv = new RedisKvStore(redis);

    expect(await kv.getdel("k")).toBe("value");
    expect(evalMock).toHaveBeenCalledOnce();
    const call = evalMock.mock.calls[0] as unknown[];
    expect(String(call[0])).toMatch(/GET/);
    expect(String(call[0])).toMatch(/DEL/);
    expect(call[2]).toBe("k");
  });

  it("getdel returns null when the key is missing", async () => {
    const redis = { getdel: vi.fn(async () => null) } as unknown as Redis;
    const kv = new RedisKvStore(redis);
    expect(await kv.getdel("k")).toBeNull();
  });

  it("incrWithTtl runs INCR + EXPIRE-on-create atomically via Lua", async () => {
    const evalMock = vi.fn(async () => 3);
    const redis = { eval: evalMock } as unknown as Redis;
    const kv = new RedisKvStore(redis);

    expect(await kv.incrWithTtl("bucket", 60)).toBe(3);
    const call = evalMock.mock.calls[0] as unknown[];
    expect(String(call[0])).toMatch(/incr/i);
    expect(String(call[0])).toMatch(/expire/i);
    expect(call[2]).toBe("bucket");
    expect(call[3]).toBe("60");
  });

  it("incrWithTtl tolerates string results from eval", async () => {
    const redis = { eval: vi.fn(async () => "7") } as unknown as Redis;
    const kv = new RedisKvStore(redis);
    expect(await kv.incrWithTtl("bucket", 60)).toBe(7);
  });

  it("ttl maps positive seconds through and negative sentinels to null", async () => {
    const ttlMock = vi.fn(async () => 42);
    const redis = { ttl: ttlMock } as unknown as Redis;
    const kv = new RedisKvStore(redis);
    expect(await kv.ttl("k")).toBe(42);

    ttlMock.mockResolvedValueOnce(-2);
    expect(await kv.ttl("k")).toBeNull();
    ttlMock.mockResolvedValueOnce(-1);
    expect(await kv.ttl("k")).toBeNull();
  });
});
