import { useCallback, useSyncExternalStore } from "hono/jsx/dom";
import { createRouter, type HistoryLike, type RouteMatch } from "./lib/router";

/** Page identifiers used by the app shell. */
export type PageId = "notes" | "editor" | "ai" | "security";

const browserHistory: HistoryLike = {
  get location() {
    return window.location;
  },
  pushState: (data, unused, url) => window.history.pushState(data, unused, url),
  replaceState: (data, unused, url) => window.history.replaceState(data, unused, url),
  addEventListener: (type, listener) => window.addEventListener(type, listener),
  removeEventListener: (type, listener) => window.removeEventListener(type, listener),
};

/** The app-wide router instance (History API). */
export const router = createRouter<PageId>(
  [
    // `/` is the Worker's SSR landing page online; offline the cached app shell lands here.
    { path: "/", value: "notes" },
    { path: "/notes", value: "notes" },
    { path: "/notes/:id", value: "editor" },
    { path: "/ai", value: "ai" },
    { path: "/settings/security", value: "security" },
  ],
  browserHistory,
);

/**
 * Subscribes a component to the current route.
 * 現在のルートを購読するフック。
 */
export function useRoute(): RouteMatch<PageId> | null {
  const subscribe = useCallback((notify: () => void) => router.subscribe(notify), []);
  return useSyncExternalStore(subscribe, router.current);
}
