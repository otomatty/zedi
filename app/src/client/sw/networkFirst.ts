/** What `networkFirst` needs from the service worker global scope. */
export interface NetworkFirstDeps {
  fetch: (request: Request) => Promise<Response>;
  caches: {
    open: (
      name: string,
    ) => Promise<{ put: (request: Request, response: Response) => Promise<void> }>;
    delete: (name: string) => Promise<boolean>;
    match: (request: Request, options: { cacheName: string }) => Promise<Response | undefined>;
  };
  cacheName: string;
}

const isNoStore = (response: Response) =>
  /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get("Cache-Control") ?? "");

/**
 * Network first, keeping the last good response for offline use. The cache is only an
 * optimisation: failures to write or clear it never replace a response the network gave.
 * ネットワーク優先で、最後の正常な応答をオフライン用に保持する。キャッシュの書き込み・削除の
 * 失敗で、ネットワークから得た応答を捨てない。
 */
export async function networkFirst(request: Request, deps: NetworkFirstDeps): Promise<Response> {
  let response: Response;
  try {
    response = await deps.fetch(request);
  } catch {
    return (await deps.caches.match(request, { cacheName: deps.cacheName })) ?? Response.error();
  }
  try {
    if (response.ok && !isNoStore(response)) {
      const cache = await deps.caches.open(deps.cacheName);
      await cache.put(request, response.clone());
    } else if (response.status === 401) {
      // The session ended: data cached for this user must not outlive it.
      await deps.caches.delete(deps.cacheName);
    }
  } catch {
    // Quota exceeded, `Vary: *` and similar: serve the fresh response without caching it.
  }
  return response;
}
