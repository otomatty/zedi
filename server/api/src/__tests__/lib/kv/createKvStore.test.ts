import { describe, it, expect, afterEach } from "vitest";
import { createKvStore, setNodeKvStoreFactory } from "../../../lib/kv/createKvStore.js";
import { DurableObjectKvStore } from "../../../lib/kv/doKvStore.js";
import type { KvStore } from "../../../lib/kv/types.js";

afterEach(() => {
  setNodeKvStoreFactory(null);
});

const fakeKv = {} as KvStore;

describe("createKvStore — Node adapter injection (FR-5 / module boundary)", () => {
  it("returns null when no KV_DO binding and no Node factory installed (Workers default)", () => {
    expect(createKvStore(undefined)).toBeNull();
    expect(createKvStore({})).toBeNull();
  });

  it("uses the injected Node factory when no KV_DO binding exists", () => {
    setNodeKvStoreFactory(() => fakeKv);
    expect(createKvStore(undefined)).toBe(fakeKv);
  });

  it("prefers the KV_DO Durable Object binding over the Node factory", () => {
    setNodeKvStoreFactory(() => fakeKv);
    const kvDoNamespace = {
      idFromName: () => ({}),
      get: () => ({}),
    } as unknown as NonNullable<Parameters<typeof createKvStore>[0]>["KV_DO"];
    const store = createKvStore({ KV_DO: kvDoNamespace });
    expect(store).toBeInstanceOf(DurableObjectKvStore);
  });
});
