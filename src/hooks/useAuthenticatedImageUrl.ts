import { useState, useEffect } from "react";

const AUTH_URL_PATTERNS = ["/api/thumbnail/serve/", "/api/media/"];

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

  if (parsedUrl.origin !== window.location.origin) {
    return false;
  }

  const { pathname } = parsedUrl;
  return AUTH_URL_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

type FetchState = { status: "loading" } | { status: "resolved"; url: string } | { status: "error" };

/**
 * Fetches an image URL with credentials and returns a blob URL.
 * For URLs that don't require auth, returns the original URL as-is.
 */
export function useAuthenticatedImageUrl(src: string | undefined): {
  resolvedUrl: string | undefined;
  isLoading: boolean;
  hasError: boolean;
} {
  const [fetchState, setFetchState] = useState<FetchState | null>(null);

  useEffect(() => {
    if (!src || !requiresAuth(src)) {
      // Intentional: clear stale state when src is no longer auth-required
      // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid showing previous blob URL
      setFetchState(null);
      return;
    }

    let cancelled = false;
    let currentBlobUrl: string | null = null;
    // Intentional: show loading immediately when src changes to avoid stale blob URL flicker

    setFetchState({ status: "loading" });

    fetch(src, { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFetchState({ status: "error" });
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        currentBlobUrl = URL.createObjectURL(blob);
        setFetchState({ status: "resolved", url: currentBlobUrl });
      })
      .catch(() => {
        if (!cancelled) setFetchState({ status: "error" });
      });

    return () => {
      cancelled = true;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [src]);

  if (!src) {
    return { resolvedUrl: undefined, isLoading: false, hasError: false };
  }
  if (!requiresAuth(src)) {
    return { resolvedUrl: src, isLoading: false, hasError: false };
  }
  return {
    resolvedUrl: fetchState?.status === "resolved" ? fetchState.url : undefined,
    isLoading: fetchState === null || fetchState.status === "loading",
    hasError: fetchState?.status === "error",
  };
}
