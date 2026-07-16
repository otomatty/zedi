/**
 * DurableObjectKvStore のユニットテスト (#1093)
 *
 * 論理キーごとに `idFromName(key)` で Durable Object を 1 個割り当て、
 * fetch ベースの JSON プロトコルで KvStore 操作を委譲するアダプタの検証。
 * 実際の KvDurableObject インスタンスに配線した fake namespace を使う。
 *
 * Tests the DO-namespace-backed KvStore adapter wired to real KvDurableObject
 * instances via a fake namespace, so the whole Workers path is exercised.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DurableObjectKvStore } from "../../../lib/kv/doKvStore.js";
import { KvDurableObject } from "../../../lib/kv/kvDurableObject.js";

function createFakeNamespace() {
  const objects = new Map<string, KvDurableObject>();
  const requestedNames: string[] = [];

  function objectFor(name: string): KvDurableObject {
    let obj = objects.get(name);
    if (!obj) {
      const map = new Map<string, unknown>();
      const state = {
        storage: {
          get: async (key: string) => map.get(key),
          put: async (entries: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(entries)) map.set(k, v);
          },
          deleteAll: async () => {
            map.clear();
          },
          setAlarm: async () => {},
          deleteAlarm: async () => {},
        },
      };
      obj = new KvDurableObject(state as unknown as DurableObjectState);
      objects.set(name, obj);
    }
    return obj;
  }

  const namespace = {
    idFromName(name: string) {
      requestedNames.push(name);
      return { name } as unknown as DurableObjectId;
    },
    get(id: { name: string }) {
      return {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          objectFor(id.name).fetch(new Request(input, init)),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, requestedNames };
}

describe("DurableObjectKvStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes each logical key to its own durable object", async () => {
    const { namespace, requestedNames } = createFakeNamespace();
    const kv = new DurableObjectKvStore(namespace);

    await kv.setex("a", 60, "1");
    await kv.setex("b", 60, "2");
    expect(requestedNames).toEqual(["a", "b"]);
    expect(await kv.get("a")).toBe("1");
    expect(await kv.get("b")).toBe("2");
  });

  it("supports the one-time code flow (setex → getdel → null)", async () => {
    const { namespace } = createFakeNamespace();
    const kv = new DurableObjectKvStore(namespace);

    await kv.setex("mcp:code:abc", 300, JSON.stringify({ userId: "u1" }));
    expect(await kv.getdel("mcp:code:abc")).toBe(JSON.stringify({ userId: "u1" }));
    expect(await kv.getdel("mcp:code:abc")).toBeNull();
  });

  it("supports fixed-window counters (incrWithTtl / ttl)", async () => {
    const { namespace } = createFakeNamespace();
    const kv = new DurableObjectKvStore(namespace);

    expect(await kv.incrWithTtl("bucket", 60)).toBe(1);
    expect(await kv.incrWithTtl("bucket", 60)).toBe(2);
    expect(await kv.ttl("bucket")).toBe(60);

    vi.advanceTimersByTime(61 * 1000);
    expect(await kv.ttl("bucket")).toBeNull();
    expect(await kv.incrWithTtl("bucket", 60)).toBe(1);
  });

  it("returns null for missing keys", async () => {
    const { namespace } = createFakeNamespace();
    const kv = new DurableObjectKvStore(namespace);
    expect(await kv.get("missing")).toBeNull();
    expect(await kv.ttl("missing")).toBeNull();
  });
});
