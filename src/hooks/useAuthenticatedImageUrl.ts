import { useState, useEffect, useRef } from "react";

const AUTH_URL_PATTERNS = ["/api/thumbnail/serve/", "/api/media/"];

function requiresAuth(url: string): boolean {
  return AUTH_URL_PATTERNS.some((pattern) => url.includes(pattern));
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
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src || !requiresAuth(src)) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setFetchState({ status: "loading" });
    });

    fetch(src, { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFetchState({ status: "error" });
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setFetchState({ status: "resolved", url: blobUrl });
      })
      .catch(() => {
        if (!cancelled) setFetchState({ status: "error" });
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
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
