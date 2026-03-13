import { describe, it, expect, vi, afterEach } from "vitest";
import { getThumbnailApiBaseUrl } from "./thumbnailApiHelpers";

describe("thumbnailApiHelpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getThumbnailApiBaseUrl", () => {
    it("returns VITE_API_BASE_URL when set", () => {
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
      expect(getThumbnailApiBaseUrl()).toBe("https://api.example.com");
    });

    it("strips trailing slash from VITE_API_BASE_URL", () => {
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
      expect(getThumbnailApiBaseUrl()).toBe("https://api.example.com");
    });

    it("falls back to window.location.origin when VITE_API_BASE_URL is undefined (browser)", () => {
      vi.stubEnv("VITE_API_BASE_URL", undefined);
      expect(getThumbnailApiBaseUrl()).toBe(window.location.origin);
    });

    it("returns empty string when VITE_API_BASE_URL is undefined (SSR, no window)", () => {
      vi.stubEnv("VITE_API_BASE_URL", undefined);
      const originalWindow = globalThis.window;
      // @ts-expect-error simulate SSR where window is undefined (required for this test)
      delete globalThis.window;
      try {
        expect(getThumbnailApiBaseUrl()).toBe("");
      } finally {
        // @ts-expect-error restore window after SSR simulation (required for other tests)
        globalThis.window = originalWindow;
      }
    });
  });
});
