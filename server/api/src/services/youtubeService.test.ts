/**
 * youtubeService の単体テスト。
 * Unit tests for YouTube service (metadata, transcript, utility functions).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// youtube-transcript パッケージをモック（CJS/ESM 互換性問題回避）
// Mock youtube-transcript package (CJS/ESM compatibility workaround)
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn().mockResolvedValue([]),
  },
}));

import { formatDuration, joinTranscriptText, type TranscriptSegment } from "./youtubeService.js";

describe("youtubeService", () => {
  describe("formatDuration", () => {
    it("formats hours, minutes, seconds", () => {
      expect(formatDuration("PT1H2M3S")).toBe("1:02:03");
    });

    it("formats minutes and seconds only", () => {
      expect(formatDuration("PT12M45S")).toBe("12:45");
    });

    it("formats seconds only", () => {
      expect(formatDuration("PT30S")).toBe("0:30");
    });

    it("formats hours and minutes", () => {
      expect(formatDuration("PT2H0M")).toBe("2:00:00");
    });

    it("returns original string for invalid format", () => {
      expect(formatDuration("invalid")).toBe("invalid");
    });

    it("handles day-based durations for long livestream VODs", () => {
      // P1DT2H3M4S → 1日 + 2時間 = 26時間 / 1 day + 2 hours = 26 hours
      expect(formatDuration("P1DT2H3M4S")).toBe("26:03:04");
    });

    it("handles day-only durations", () => {
      // P2DT (2 days) → 48時間 / 2 days → 48 hours
      expect(formatDuration("P2DT0H0M0S")).toBe("48:00:00");
    });

    it("handles zero values", () => {
      expect(formatDuration("PT0M0S")).toBe("0:00");
    });
  });

  describe("joinTranscriptText", () => {
    it("joins segments with spaces", () => {
      const segments: TranscriptSegment[] = [
        { text: "Hello", offset: 0, duration: 1 },
        { text: "world", offset: 1, duration: 1 },
        { text: "test", offset: 2, duration: 1 },
      ];
      expect(joinTranscriptText(segments)).toBe("Hello world test");
    });

    it("returns empty string for empty array", () => {
      expect(joinTranscriptText([])).toBe("");
    });

    it("handles single segment", () => {
      const segments: TranscriptSegment[] = [{ text: "Only one", offset: 0, duration: 1 }];
      expect(joinTranscriptText(segments)).toBe("Only one");
    });
  });

  describe("fetchYouTubeMetadata", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("throws on API error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      const { fetchYouTubeMetadata } = await import("./youtubeService.js");
      await expect(fetchYouTubeMetadata("test123456_", "fake-key")).rejects.toThrow(
        /YouTube Data API failed: 404/,
      );
    });

    it("throws when video not found (empty items)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { fetchYouTubeMetadata } = await import("./youtubeService.js");
      await expect(fetchYouTubeMetadata("test123456_", "fake-key")).rejects.toThrow(
        /YouTube video not found/,
      );
    });

    it("parses valid API response", async () => {
      const mockResponse = {
        items: [
          {
            snippet: {
              title: "Test Video",
              description: "A test video description",
              channelTitle: "Test Channel",
              publishedAt: "2024-01-15T10:00:00Z",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/test/hqdefault.jpg", width: 480, height: 360 },
              },
              tags: ["test", "video"],
            },
            contentDetails: {
              duration: "PT10M30S",
            },
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { fetchYouTubeMetadata } = await import("./youtubeService.js");
      const result = await fetchYouTubeMetadata("test123456_", "fake-key");

      expect(result.title).toBe("Test Video");
      expect(result.description).toBe("A test video description");
      expect(result.channelTitle).toBe("Test Channel");
      expect(result.duration).toBe("PT10M30S");
      expect(result.tags).toEqual(["test", "video"]);
      expect(result.thumbnailUrl).toBe("https://i.ytimg.com/vi/test/hqdefault.jpg");
    });
  });
});
