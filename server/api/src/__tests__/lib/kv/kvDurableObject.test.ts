/**
 * KvDurableObject のユニットテスト (#1093)
 *
 * Durable Object 1 個 = 論理キー 1 個。fetch ベースの JSON プロトコルで
 * get / setex / getdel / incrWithTtl / ttl を提供し、期限切れは遅延削除 +
 * alarm によるクリーンアップで扱う。
 *
 * Unit tests for the per-key KV Durable Object (#1093). Uses a fake
 * DurableObjectState backed by a Map and fake timers for TTL behaviour.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { KvDurableObject } from "../../../lib/kv/kvDurableObject.js";

interface FakeState {
  storage: {
    get: (key: string) => Promise<unknown>;
    put: (entries: Record<string, unknown>) => Promise<void>;
    deleteAll: () => Promise<void>;
    setAlarm: (time: number) => Promise<void>;
    deleteAlarm: () => Promise<void>;
  };
  _map: Map<string, unknown>;
  _alarm: number | null;
}

function createFakeState(): FakeState {
  const map = new Map<string, unknown>();
  const state: FakeState = {
    _map: map,
    _alarm: null,
    storage: {
      get: async (key: string) => map.get(key),
      put: async (entries: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(entries)) map.set(k, v);
      },
      deleteAll: async () => {
        map.clear();
      },
      setAlarm: async (time: number) => {
        state._alarm = time;
      },
      deleteAlarm: async () => {
        state._alarm = null;
      },
    },
  };
  return state;
}

async function call(
  obj: KvDurableObject,
  op: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await obj.fetch(
    new Request("https://kv/", {
      method: "POST",
      body: JSON.stringify({ op, ...args }),
      headers: { "content-type": "application/json" },
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe("KvDurableObject", () => {
  let state: FakeState;
  let obj: KvDurableObject;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00Z"));
    state = createFakeState();
    obj = new KvDurableObject(state as unknown as DurableObjectState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get returns null for a missing key", async () => {
    expect(await call(obj, "get")).toEqual({ value: null });
  });

  it("setex stores a value retrievable via get, with an alarm at expiry", async () => {
    await call(obj, "setex", { ttlSec: 300, value: "hello" });
    expect(await call(obj, "get")).toEqual({ value: "hello" });
    expect(state._alarm).toBe(Date.now() + 300 * 1000);
  });

  it("get returns null after the TTL has elapsed (lazy expiry)", async () => {
    await call(obj, "setex", { ttlSec: 60, value: "ephemeral" });
    vi.advanceTimersByTime(61 * 1000);
    expect(await call(obj, "get")).toEqual({ value: null });
  });

  it("getdel returns the value once and null afterwards", async () => {
    await call(obj, "setex", { ttlSec: 300, value: "one-time" });
    expect(await call(obj, "getdel")).toEqual({ value: "one-time" });
    expect(await call(obj, "getdel")).toEqual({ value: null });
    expect(await call(obj, "get")).toEqual({ value: null });
  });

  it("getdel returns null for an expired value", async () => {
    await call(obj, "setex", { ttlSec: 60, value: "gone" });
    vi.advanceTimersByTime(61 * 1000);
    expect(await call(obj, "getdel")).toEqual({ value: null });
  });

  it("incrWithTtl counts up and only sets the window on creation", async () => {
    expect(await call(obj, "incrWithTtl", { ttlSec: 60 })).toEqual({ count: 1 });
    const windowEnd = Date.now() + 60 * 1000;
    expect(state._alarm).toBe(windowEnd);

    // 2 回目以降は TTL を更新しない（固定ウィンドウ）。
    // Subsequent increments must not slide the window.
    vi.advanceTimersByTime(30 * 1000);
    expect(await call(obj, "incrWithTtl", { ttlSec: 60 })).toEqual({ count: 2 });
    expect(state._alarm).toBe(windowEnd);
  });

  it("incrWithTtl restarts from 1 after the window expires", async () => {
    await call(obj, "incrWithTtl", { ttlSec: 60 });
    await call(obj, "incrWithTtl", { ttlSec: 60 });
    vi.advanceTimersByTime(61 * 1000);
    expect(await call(obj, "incrWithTtl", { ttlSec: 60 })).toEqual({ count: 1 });
  });

  it("ttl reports remaining seconds, and null when the key is missing", async () => {
    expect(await call(obj, "ttl")).toEqual({ ttlSec: null });
    await call(obj, "setex", { ttlSec: 120, value: "x" });
    vi.advanceTimersByTime(30 * 1000);
    expect(await call(obj, "ttl")).toEqual({ ttlSec: 90 });
    vi.advanceTimersByTime(91 * 1000);
    expect(await call(obj, "ttl")).toEqual({ ttlSec: null });
  });

  it("alarm clears the stored entry", async () => {
    await call(obj, "setex", { ttlSec: 60, value: "cleanup" });
    await obj.alarm();
    expect(state._map.size).toBe(0);
    expect(await call(obj, "get")).toEqual({ value: null });
  });

  it("rejects unknown operations with 400", async () => {
    const res = await obj.fetch(
      new Request("https://kv/", { method: "POST", body: JSON.stringify({ op: "nope" }) }),
    );
    expect(res.status).toBe(400);
  });
});
