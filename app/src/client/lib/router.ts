/**
 * Route definition: `:name` segments capture one path segment.
 * ルート定義。`:name` は 1 セグメントを取り出す。
 */
export interface RouteDef<T> {
  path: string;
  value: T;
}

/** Result of matching a pathname against the route table. */
export interface RouteMatch<T> {
  value: T;
  params: Record<string, string>;
  path: string;
}

/** The subset of `window.history` the router needs (lets tests use a memory history). */
export interface HistoryLike {
  location: { pathname: string };
  pushState(data: unknown, unused: string, url: string): void;
  replaceState(data: unknown, unused: string, url: string): void;
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/**
 * Finds the first route whose segments match `pathname`.
 * `pathname` に一致する最初のルートを返す。
 */
export function matchRoute<T>(
  routes: readonly RouteDef<T>[],
  pathname: string,
): RouteMatch<T> | null {
  const actual = splitPath(pathname);
  for (const route of routes) {
    const expected = splitPath(route.path);
    if (expected.length !== actual.length) continue;
    const params: Record<string, string> = {};
    const ok = expected.every((segment, i) => {
      const value = actual[i] as string;
      if (segment.startsWith(":")) {
        params[segment.slice(1)] = decodeURIComponent(value);
        return true;
      }
      return segment === value;
    });
    if (ok) return { value: route.value, params, path: pathname };
  }
  return null;
}

/** Minimal client-side router over the History API. */
export interface Router<T> {
  current(): RouteMatch<T> | null;
  navigate(to: string, options?: { replace?: boolean }): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/**
 * Creates a router bound to `history`; subscribers fire on navigate and popstate.
 * `history` に結び付いたルーターを作る。navigate と popstate で購読者に通知する。
 */
export function createRouter<T>(routes: readonly RouteDef<T>[], history: HistoryLike): Router<T> {
  const listeners = new Set<() => void>();
  let current = matchRoute(routes, history.location.pathname);
  const update = () => {
    current = matchRoute(routes, history.location.pathname);
    listeners.forEach((listener) => listener());
  };
  history.addEventListener("popstate", update);

  return {
    current: () => current,
    navigate(to, options) {
      if (options?.replace) history.replaceState(null, "", to);
      else history.pushState(null, "", to);
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      history.removeEventListener("popstate", update);
      listeners.clear();
    },
  };
}

/**
 * Whether a link click should be handled by the router instead of the browser.
 * リンクのクリックをルーターで処理すべきか（修飾キーや別タブ指定はブラウザに任せる）。
 */
export function shouldInterceptClick(
  event: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
  },
  anchor: { origin: string; target: string; hasDownload: boolean },
  currentOrigin: string,
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasDownload) return false;
  return anchor.origin === currentOrigin;
}
