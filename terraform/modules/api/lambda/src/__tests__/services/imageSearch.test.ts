import { describe, it, expect, vi, afterEach } from "vitest";
import { searchImages } from "../../services/imageSearch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("imageSearch", () => {
  describe("searchImages", () => {
    it("returns empty array for empty query", async () => {
      expect(await searchImages("", "key", "cx", 1, 10)).toEqual([]);
    });

    it("returns empty array for missing apiKey", async () => {
      expect(await searchImages("cats", "", "cx", 1, 10)).toEqual([]);
    });

    it("returns empty array for missing searchEngineId", async () => {
      expect(await searchImages("cats", "key", "", 1, 10)).toEqual([]);
    });

    it("returns empty array when start > 100", async () => {
      const result = await searchImages("cats", "key", "cx", 12, 10);
      expect(result).toEqual([]);
    });

    it("correctly maps Google API response to ImageSearchItem[]", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                {
                  title: "Test Image",
                  link: "https://example.com/image.jpg",
                  displayLink: "example.com",
                  image: {
                    thumbnailLink: "https://example.com/thumb.jpg",
                    contextLink: "https://example.com/page",
                  },
                },
                {
                  title: "No Image",
                  link: "https://example.com/other.jpg",
                },
              ],
            }),
        }),
      );

      const results = await searchImages("test", "key", "cx", 1, 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: "https://example.com/image.jpg",
        previewUrl: "https://example.com/thumb.jpg",
        imageUrl: "https://example.com/image.jpg",
        alt: "Test Image",
        sourceName: "example.com",
        sourceUrl: "https://example.com/page",
      });
    });

    it("throws error on non-OK response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Forbidden"),
        }),
      );

      await expect(searchImages("test", "key", "cx", 1, 10)).rejects.toThrow(
        "Google Custom Search failed: 403",
      );
    });

    it("clamps limit between 1 and 10", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await searchImages("test", "key", "cx", 1, 50);
      const url1 = mockFetch.mock.calls[0][0] as string;
      expect(url1).toContain("num=10");

      await searchImages("test", "key", "cx", 1, -5);
      const url2 = mockFetch.mock.calls[1][0] as string;
      expect(url2).toContain("num=1");
    });
  });
});
