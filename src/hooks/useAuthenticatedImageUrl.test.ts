import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useAuthenticatedImageUrl,
  requiresAuth,
  __resetImageCacheForTesting,
} from "./useAuthenticatedImageUrl";

const FAKE_BLOB_URL = "blob:http://localhost:3000/fake-uuid";

let mockCreateObjectURL: ReturnType<typeof vi.fn>;
let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

// IntersectionObserver の callback を捕捉して任意のタイミングで発火するためのストア。
// Storage for the most-recent IntersectionObserver callback so tests can fire it.
type IOCallback = (entries: IntersectionObserverEntry[]) => void;
let lastObserverCallback: IOCallback | null = null;
let lastObserverDisconnect: ReturnType<typeof vi.fn> | null = null;
const originalIntersectionObserver = global.IntersectionObserver;

beforeEach(() => {
  mockCreateObjectURL = vi.fn().mockReturnValue(FAKE_BLOB_URL);
  mockRevokeObjectURL = vi.fn();
  global.URL.createObjectURL = mockCreateObjectURL as (obj: Blob | MediaSource) => string;
  global.URL.revokeObjectURL = mockRevokeObjectURL as (url: string) => void;
  vi.spyOn(global, "fetch");

  lastObserverCallback = null;
  lastObserverDisconnect = null;
  global.IntersectionObserver = class IO {
    readonly root: Element | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
    constructor(cb: IntersectionObserverCallback) {
      lastObserverCallback = cb as unknown as IOCallback;
      lastObserverDisconnect = this.disconnect;
    }
  } as unknown as typeof IntersectionObserver;

  __resetImageCacheForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  global.IntersectionObserver = originalIntersectionObserver;
  __resetImageCacheForTesting();
});

function mockFetchSuccess(body = new Blob(["img"], { type: "image/png" })) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(body),
  });
}

function mockFetchError(status = 401) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    blob: () => Promise.reject(new Error("not ok")),
  });
}

function mockFetchNetworkError() {
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Network error"));
}

describe("requiresAuth", () => {
  it("returns true for same-origin /api/thumbnail/serve/ URLs", () => {
    expect(requiresAuth("/api/thumbnail/serve/abc-123")).toBe(true);
  });

  it("returns true for same-origin /api/media/ URLs", () => {
    expect(requiresAuth("/api/media/image.png")).toBe(true);
  });

  it("returns false for non-API same-origin URLs", () => {
    expect(requiresAuth("/images/logo.png")).toBe(false);
  });

  it("returns false for external URLs containing the pattern", () => {
    expect(requiresAuth("https://evil.com/api/thumbnail/serve/abc")).toBe(false);
  });

  it("returns false for fully external URLs", () => {
    expect(requiresAuth("https://cdn.example.com/photo.jpg")).toBe(false);
  });

  it("returns false for unparseable URLs", () => {
    expect(requiresAuth("://invalid")).toBe(false);
  });

  it("returns true for full same-origin URL", () => {
    const url = `${window.location.origin}/api/thumbnail/serve/abc-123`;
    expect(requiresAuth(url)).toBe(true);
  });

  describe("when VITE_API_BASE_URL is set (cross-origin API)", () => {
    const API_ORIGIN = "https://api.zedi-note.app";

    beforeEach(() => {
      vi.stubEnv("VITE_API_BASE_URL", API_ORIGIN);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns true for cross-origin thumbnail URL matching API base", () => {
      expect(requiresAuth(`${API_ORIGIN}/api/thumbnail/serve/abc-123`)).toBe(true);
    });

    it("returns true for cross-origin media URL matching API base", () => {
      expect(requiresAuth(`${API_ORIGIN}/api/media/xyz`)).toBe(true);
    });

    it("returns false for other origin even with auth path", () => {
      expect(requiresAuth("https://evil.com/api/thumbnail/serve/abc")).toBe(false);
    });
  });
});

describe("useAuthenticatedImageUrl", () => {
  it("returns undefined for undefined src", () => {
    const { result } = renderHook(() => useAuthenticatedImageUrl(undefined));

    expect(result.current.resolvedUrl).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes through non-auth URLs without fetching", () => {
    const url = "https://cdn.example.com/photo.jpg";
    const { result } = renderHook(() => useAuthenticatedImageUrl(url));

    expect(result.current.resolvedUrl).toBe(url);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches auth-required URL with credentials and returns blob URL", async () => {
    mockFetchSuccess();
    const src = "/api/thumbnail/serve/abc-123";

    const { result } = renderHook(() => useAuthenticatedImageUrl(src));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.resolvedUrl).toBe(FAKE_BLOB_URL);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(src, { credentials: "include" });
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it("sets hasError on non-ok response", async () => {
    mockFetchError(401);
    const src = "/api/thumbnail/serve/abc-123";

    const { result } = renderHook(() => useAuthenticatedImageUrl(src));

    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });

    expect(result.current.resolvedUrl).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets hasError on network error", async () => {
    mockFetchNetworkError();
    const src = "/api/media/image.png";

    const { result } = renderHook(() => useAuthenticatedImageUrl(src));

    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });

    expect(result.current.resolvedUrl).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("revokes blob URL on unmount", async () => {
    mockFetchSuccess();
    const src = "/api/thumbnail/serve/abc-123";

    const { result, unmount } = renderHook(() => useAuthenticatedImageUrl(src));

    await waitFor(() => {
      expect(result.current.resolvedUrl).toBe(FAKE_BLOB_URL);
    });

    unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith(FAKE_BLOB_URL);
  });

  it("revokes old blob URL and fetches new one when src changes", async () => {
    const blobUrl1 = "blob:http://localhost:3000/first";
    const blobUrl2 = "blob:http://localhost:3000/second";
    mockCreateObjectURL.mockReturnValueOnce(blobUrl1).mockReturnValueOnce(blobUrl2);
    mockFetchSuccess();

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useAuthenticatedImageUrl(src),
      { initialProps: { src: "/api/thumbnail/serve/aaa" } },
    );

    await waitFor(() => {
      expect(result.current.resolvedUrl).toBe(blobUrl1);
    });

    rerender({ src: "/api/thumbnail/serve/bbb" });

    expect(mockRevokeObjectURL).toHaveBeenCalledWith(blobUrl1);

    await waitFor(() => {
      expect(result.current.resolvedUrl).toBe(blobUrl2);
    });
  });

  it("fetches cross-origin API thumbnail URL with credentials when VITE_API_BASE_URL matches", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.zedi-note.app");
    try {
      mockFetchSuccess();
      const src = "https://api.zedi-note.app/api/thumbnail/serve/cross-origin-id";

      const { result } = renderHook(() => useAuthenticatedImageUrl(src));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasError).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith(src, { credentials: "include" });
      expect(mockCreateObjectURL).toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("cancels in-flight fetch when src changes before completion", async () => {
    let resolveFirst!: (res: { ok: boolean; blob: () => Promise<Blob> }) => void;
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["img2"])),
      });

    const blobUrl2 = "blob:http://localhost:3000/second";
    mockCreateObjectURL.mockReturnValue(blobUrl2);

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useAuthenticatedImageUrl(src),
      { initialProps: { src: "/api/thumbnail/serve/aaa" } },
    );

    rerender({ src: "/api/thumbnail/serve/bbb" });

    await act(async () => {
      resolveFirst({ ok: true, blob: () => Promise.resolve(new Blob(["img1"])) });
    });

    await waitFor(() => {
      expect(result.current.resolvedUrl).toBe(blobUrl2);
    });

    expect(result.current.hasError).toBe(false);
  });

  // ─── Shared cache (Issue #851) ──────────────────────────────────────
  describe("shared cache across instances", () => {
    it("fetches only once when two hooks subscribe to the same src", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/shared-1";

      const { result: r1 } = renderHook(() => useAuthenticatedImageUrl(src));
      const { result: r2 } = renderHook(() => useAuthenticatedImageUrl(src));

      await waitFor(() => {
        expect(r1.current.resolvedUrl).toBe(FAKE_BLOB_URL);
        expect(r2.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });

    it("only revokes blob URL after every subscriber unmounts", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/shared-2";

      const { result: r1, unmount: u1 } = renderHook(() => useAuthenticatedImageUrl(src));
      const { result: r2, unmount: u2 } = renderHook(() => useAuthenticatedImageUrl(src));

      await waitFor(() => {
        expect(r1.current.resolvedUrl).toBe(FAKE_BLOB_URL);
        expect(r2.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });

      u1();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();

      u2();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(FAKE_BLOB_URL);
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it("resolves immediately for a second subscriber when entry is already cached", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/shared-3";

      const { result: r1 } = renderHook(() => useAuthenticatedImageUrl(src));
      await waitFor(() => {
        expect(r1.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });

      const { result: r2 } = renderHook(() => useAuthenticatedImageUrl(src));
      await waitFor(() => {
        expect(r2.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Lazy loading via IntersectionObserver (Issue #851) ─────────────
  describe("lazy loading", () => {
    let element: HTMLDivElement;

    beforeEach(() => {
      element = document.createElement("div");
      document.body.appendChild(element);
    });

    afterEach(() => {
      if (element.parentNode) element.parentNode.removeChild(element);
    });

    it("does not fetch until the observed element intersects", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/lazy-1";
      const ref = { current: element };

      const { result } = renderHook(() => useAuthenticatedImageUrl(src, { lazy: true, ref }));

      // 初期描画では fetch しない / Initial render does not fetch
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.resolvedUrl).toBeUndefined();
    });

    it("fetches after intersection callback fires", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/lazy-2";
      const ref = { current: element };

      const { result } = renderHook(() => useAuthenticatedImageUrl(src, { lazy: true, ref }));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(lastObserverCallback).not.toBeNull();

      await act(async () => {
        lastObserverCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
      });

      await waitFor(() => {
        expect(result.current.resolvedUrl).toBe(FAKE_BLOB_URL);
      });
      expect(global.fetch).toHaveBeenCalledWith(src, { credentials: "include" });
    });

    it("disconnects the observer after intersection", async () => {
      mockFetchSuccess();
      const src = "/api/thumbnail/serve/lazy-3";
      const ref = { current: element };

      renderHook(() => useAuthenticatedImageUrl(src, { lazy: true, ref }));

      const disconnect = lastObserverDisconnect;
      await act(async () => {
        lastObserverCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
      });

      expect(disconnect).toHaveBeenCalled();
    });
  });
});
