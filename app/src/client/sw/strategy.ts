/**
 * How the service worker answers a request.
 * - `cacheFirst`: hashed build assets never change, so the cached copy is always right.
 * - `appShell`: page navigations try the network and fall back to the cached `index.html`.
 * - `networkFirst`: page data the app needs to open offline; the last response is kept.
 * - `network`: everything else is left to the browser (auth, search, AI, realtime, writes).
 * Service Worker の応答方式。ビルド成果物はキャッシュ優先、画面遷移はネットワーク優先で
 * 失敗時にアプリシェル、オフライン表示に要るデータ API はネットワーク優先で最後の応答を保持する。
 */
export type Strategy = "cacheFirst" | "appShell" | "networkFirst" | "network";

/** Cache holding the last API responses (cleared on sign-out and when the API answers 401). */
export const API_CACHE = "zedi-api-v1";

/** API reads the app needs to open the notes list and an editor offline. */
const OFFLINE_DATA = [/^\/api\/me$/, /^\/api\/notes\/[^/]+\/pages$/, /^\/api\/pages\/[^/]+$/];

/** Picks the strategy for a request (a pure function, so it is unit tested outside a worker). */
export function strategyFor(
  request: { url: string; method: string; mode: RequestMode },
  origin: string,
): Strategy {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== origin) return "network";
  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/parties/")) {
    return request.mode !== "navigate" && OFFLINE_DATA.some((p) => p.test(path))
      ? "networkFirst"
      : "network";
  }
  if (request.mode === "navigate") return "appShell";
  if (path.startsWith("/assets/")) return "cacheFirst";
  return "network";
}
