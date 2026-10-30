/// <reference lib="webworker" />
/**
 * Service worker: app shell and build assets precached at install, page data APIs kept for
 * offline use. The precache list and version are filled in by the build (vite.config.ts).
 * Service Worker。インストール時にアプリシェルとビルド成果物を保存し、データ API は
 * オフライン用に最後の応答を保持する。保存一覧とバージョンはビルド時に埋め込む。
 */
import { API_CACHE, strategyFor, type Strategy } from "./strategy";

declare const self: ServiceWorkerGlobalScope;

const PRECACHE: string[] = ["__ZEDI_PRECACHE__"];
const SHELL_CACHE = "zedi-shell-__ZEDI_VERSION__";
/** Any SPA route returns index.html (Static Assets SPA fallback); `/` itself is the SSR landing. */
const SHELL_URL = "/notes";

async function install() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(PRECACHE);
  const shell = await fetch(SHELL_URL, { cache: "reload", credentials: "omit" });
  if (!shell.ok) throw new Error(`app shell: ${shell.status}`);
  await cache.put(SHELL_URL, shell);
  await self.skipWaiting();
}

async function activate() {
  for (const key of await caches.keys()) {
    if (key.startsWith("zedi-shell-") && key !== SHELL_CACHE) await caches.delete(key);
  }
  await self.clients.claim();
}

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, response.clone());
    } else if (response.status === 401) {
      // The session ended: data cached for this user must not outlive it.
      await caches.delete(API_CACHE);
    }
    return response;
  } catch {
    return (await caches.match(request, { cacheName: API_CACHE })) ?? Response.error();
  }
}

async function respond(strategy: Exclude<Strategy, "network">, request: Request) {
  switch (strategy) {
    case "cacheFirst":
      return (await caches.match(request, { cacheName: SHELL_CACHE })) ?? fetch(request);
    case "appShell":
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })) ?? Response.error();
      }
    case "networkFirst":
      return networkFirst(request);
  }
}

self.addEventListener("install", (event) => event.waitUntil(install()));
self.addEventListener("activate", (event) => event.waitUntil(activate()));
self.addEventListener("fetch", (event) => {
  const strategy = strategyFor(event.request, self.location.origin);
  if (strategy !== "network") event.respondWith(respond(strategy, event.request));
});
