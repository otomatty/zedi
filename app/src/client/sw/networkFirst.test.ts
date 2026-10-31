import { describe, expect, it, vi } from "vitest";
import { networkFirst } from "./networkFirst";

const CACHE = "zedi-api-test";

/** In-memory CacheStorage with one cache; `put` can be made to throw. */
function fakeCaches(options: { putFails?: boolean } = {}) {
  const store = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (request: Request, response: Response) => {
      if (options.putFails) throw new DOMException("quota", "QuotaExceededError");
      store.set(request.url, response);
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
  };
  return { caches, cache, store };
}

const request = new Request("https://zedi.test/api/me");

describe("networkFirst", () => {
  it("returns the network response and keeps a copy for offline use", async () => {
    const { caches, store } = fakeCaches();
    const fetch = vi.fn(async () => new Response("fresh"));

    const response = await networkFirst(request, { fetch, caches, cacheName: CACHE });

    expect(await response.text()).toBe("fresh");
    expect(await store.get(request.url)?.text()).toBe("fresh");
  });

  it("still returns the fresh response when keeping the copy fails", async () => {
    // キャッシュは最適化にすぎないので、書き込みの失敗でネットワークの応答を捨てない。
    // The cache is only an optimisation: a failed write must not discard the network response.
    const { caches } = fakeCaches({ putFails: true });
    const fetch = vi.fn(async () => new Response("fresh"));

    const response = await networkFirst(request, { fetch, caches, cacheName: CACHE });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fresh");
  });

  it("does not keep a response marked no-store", async () => {
    const { caches, cache } = fakeCaches();
    const fetch = vi.fn(
      async () => new Response("secret", { headers: { "Cache-Control": "private, no-store" } }),
    );

    const response = await networkFirst(request, { fetch, caches, cacheName: CACHE });

    expect(await response.text()).toBe("secret");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("drops the cached data when the session has ended (401)", async () => {
    const { caches } = fakeCaches();
    const fetch = vi.fn(async () => new Response("", { status: 401 }));

    const response = await networkFirst(request, { fetch, caches, cacheName: CACHE });

    expect(response.status).toBe(401);
    expect(caches.delete).toHaveBeenCalledWith(CACHE);
  });

  it("drops the cached data when the session has not passed the second factor (403)", async () => {
    // 2 段階目の前のセッションに、前のセッションのデータをオフラインで見せない。
    // A session that has not passed the second factor must not see an earlier session's data offline.
    const { caches } = fakeCaches();
    const fetch = vi.fn(async () => new Response("", { status: 403 }));

    const response = await networkFirst(request, { fetch, caches, cacheName: CACHE });

    expect(response.status).toBe(403);
    expect(caches.delete).toHaveBeenCalledWith(CACHE);
  });

  it("answers from the cache when the network is down, and errors without a copy", async () => {
    const { caches, store } = fakeCaches();
    store.set(request.url, new Response("cached"));
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const cached = await networkFirst(request, { fetch: offline, caches, cacheName: CACHE });
    expect(await cached.text()).toBe("cached");

    store.clear();
    const missing = await networkFirst(request, { fetch: offline, caches, cacheName: CACHE });
    expect(missing.type).toBe("error");
  });
});
