/**
 * DurableObjectKvStore の workerd 実行テスト（#1091 SR-6 全 3 用途）。
 *
 * - `incrWithTtl` — レート制限固定ウィンドウカウンタ
 * - `getdel` — ext/MCP ワンタイムコードの原子消費
 * - `setex` + `get` — MCP 失効 deny-list
 *
 * 実 DO binding（wrangler.jsonc の KV_DO → KvDurableObject）に対して実行する。
 * Exercises all three security-relevant KvStore usages against the real
 * Durable Object binding under workerd.
 */
/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { DurableObjectKvStore } from "../../lib/kv/doKvStore.js";

function store() {
  const kvDo = (env as unknown as Record<string, unknown>).KV_DO;
  return new DurableObjectKvStore(kvDo as ConstructorParameters<typeof DurableObjectKvStore>[0]);
}

describe("DurableObjectKvStore on workerd (SR-6)", () => {
  it("incrWithTtl counts within a fixed window (rate-limit counter)", async () => {
    const kv = store();
    const key = `test:rate:${crypto.randomUUID()}`;
    const first = await kv.incrWithTtl(key, 60);
    const second = await kv.incrWithTtl(key, 60);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("getdel consumes a one-time code atomically", async () => {
    const kv = store();
    const key = `test:code:${crypto.randomUUID()}`;
    await kv.setex(key, 60, "one-time-value");
    const first = await kv.getdel(key);
    const second = await kv.getdel(key);
    expect(first).toBe("one-time-value");
    expect(second).toBeNull();
  });

  it("setex + get serve the deny-list lookup", async () => {
    const kv = store();
    const key = `test:deny:${crypto.randomUUID()}`;
    expect(await kv.get(key)).toBeNull();
    await kv.setex(key, 60, "revoked");
    expect(await kv.get(key)).toBe("revoked");
  });
});
