import { useEffect, useState } from "react";

const AUTH_URL_PATTERNS = ["/api/thumbnail/serve/", "/api/media/"];

function getApiOrigin(): string | null {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

export function requiresAuth(url: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, window.location.origin);
  } catch {
    return false;
  }

  const apiOrigin = getApiOrigin();
  const isKnownOrigin =
    parsedUrl.origin === window.location.origin ||
    (apiOrigin != null && parsedUrl.origin === apiOrigin);

  if (!isKnownOrigin) return false;

  const { pathname } = parsedUrl;
  return AUTH_URL_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

// ─── Module-scoped shared cache ────────────────────────────────────────
// 同一 src のフェッチを 1 回に統合し、blob URL を refCount で共有する。
// Share fetches for the same `src` and reference-count blob URLs so multiple
// callers don't create duplicate object URLs.

type CacheEntry = {
  status: "loading" | "resolved" | "error";
  promise?: Promise<string | null>;
  url?: string;
  refCount: number;
};

const cache = new Map<string, CacheEntry>();

function acquireImage(src: string): Promise<string | null> {
  const existing = cache.get(src);
  if (existing) {
    existing.refCount += 1;
    if (existing.status === "loading" && existing.promise) return existing.promise;
    if (existing.status === "resolved" && existing.url) return Promise.resolve(existing.url);
    return Promise.resolve(null);
  }

  const entry: CacheEntry = { status: "loading", refCount: 1 };

  entry.promise = (async () => {
    try {
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) {
        if (entry.refCount > 0) {
          entry.status = "error";
        } else {
          cache.delete(src);
        }
        return null;
      }
      const blob = await res.blob();
      if (entry.refCount <= 0) {
        // 既に全 caller がアンマウントされた。blob URL を作らずに破棄。
        // All callers unmounted before fetch completed; skip blob creation.
        cache.delete(src);
        return null;
      }
      const url = URL.createObjectURL(blob);
      entry.status = "resolved";
      entry.url = url;
      return url;
    } catch {
      if (entry.refCount > 0) {
        entry.status = "error";
      } else {
        cache.delete(src);
      }
      return null;
    }
  })();

  cache.set(src, entry);
  return entry.promise;
}

function releaseImage(src: string): void {
  const entry = cache.get(src);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entry.status === "resolved" && entry.url) {
    URL.revokeObjectURL(entry.url);
    cache.delete(src);
  } else if (entry.status === "error") {
    cache.delete(src);
  }
  // loading のままなら、非同期 body 側で refCount を再チェックして掃除する。
  // For loading entries, the async body re-checks refCount and cleans up.
}

/** Test-only helper. キャッシュを全クリアし、resolved の blob URL を revoke する。 */
export function __resetImageCacheForTesting(): void {
  for (const entry of cache.values()) {
    if (entry.status === "resolved" && entry.url) {
      URL.revokeObjectURL(entry.url);
    }
  }
  cache.clear();
}

type FetchState = { status: "loading" } | { status: "resolved"; url: string } | { status: "error" };

/**
 * `useAuthenticatedImageUrl` のオプション。
 *
 * Options for `useAuthenticatedImageUrl`.
 */
export type UseAuthenticatedImageUrlOptions = {
  /**
   * `true` の時、`ref` が viewport に入るまで `fetch` を遅延する。
   * 既定は `false`（即時 fetch）。
   *
   * When `true`, defer the `fetch` until `ref` enters the viewport.
   * Defaults to `false` (fetch immediately).
   */
  lazy?: boolean;
  /**
   * `lazy: true` 時に IntersectionObserver で監視する DOM 要素の ref。
   *
   * Ref to the DOM element observed by IntersectionObserver when `lazy: true`.
   */
  ref?: React.RefObject<Element | null>;
};

/**
 * 認証付きエンドポイントから画像を取得し、blob URL を返すフック。
 * 同一 URL のリクエストはモジュールスコープのキャッシュで共有され、
 * 全ての caller がアンマウントされたタイミングで blob URL が revoke される。
 *
 * Fetches an image from an authenticated endpoint and returns a blob URL.
 * Requests for the same URL are deduplicated via a module-scoped cache, and
 * the blob URL is revoked once every caller unmounts.
 *
 * Pass `{ lazy: true, ref }` to defer the fetch until the referenced element
 * enters the viewport.
 */
export function useAuthenticatedImageUrl(
  src: string | undefined,
  options: UseAuthenticatedImageUrlOptions = {},
): {
  resolvedUrl: string | undefined;
  isLoading: boolean;
  hasError: boolean;
} {
  const { lazy = false, ref } = options;
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [hasIntersected, setHasIntersected] = useState(false);
  const isVisible = !lazy || hasIntersected;

  useEffect(() => {
    if (!lazy || hasIntersected) return;
    const element = ref?.current ?? null;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, ref, hasIntersected]);

  useEffect(() => {
    if (!src || !requiresAuth(src) || !isVisible) {
      // Intentional: clear stale state when src is no longer auth-required
      // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid showing previous blob URL
      setFetchState(null);
      return;
    }

    let cancelled = false;
    // Intentional: show loading immediately when src changes to avoid stale blob URL flicker
    setFetchState({ status: "loading" });

    acquireImage(src).then((url) => {
      if (cancelled) return;
      if (url === null) {
        setFetchState({ status: "error" });
      } else {
        setFetchState({ status: "resolved", url });
      }
    });

    return () => {
      cancelled = true;
      releaseImage(src);
    };
  }, [src, isVisible]);

  if (!src) {
    return { resolvedUrl: undefined, isLoading: false, hasError: false };
  }
  if (!requiresAuth(src)) {
    return { resolvedUrl: src, isLoading: false, hasError: false };
  }
  if (!isVisible) {
    return { resolvedUrl: undefined, isLoading: false, hasError: false };
  }
  return {
    resolvedUrl: fetchState?.status === "resolved" ? fetchState.url : undefined,
    isLoading: fetchState === null || fetchState.status === "loading",
    hasError: fetchState?.status === "error",
  };
}
