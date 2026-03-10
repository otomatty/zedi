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

    it("returns empty string when VITE_API_BASE_URL is undefined", () => {
      vi.stubEnv("VITE_API_BASE_URL", undefined);
      expect(getThumbnailApiBaseUrl()).toBe("");
    });
  });
});
