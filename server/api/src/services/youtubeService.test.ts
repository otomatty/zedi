/**
 * youtubeService の単体テスト。
 * Unit tests for YouTube service (metadata, transcript, utility functions).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// youtubei.js モック / Mock the Innertube client
const mockGetInfo = vi.fn();
const mockCreate = vi.fn();
vi.mock("youtubei.js", () => ({
  Innertube: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

import {
  formatDuration,
  joinTranscriptText,
  fetchYouTubeContent,
  __resetInnertubeForTesting,
  type TranscriptSegment,
} from "./youtubeService.js";

/**
 * basic_info / page / getTranscript を持つ最小限の VideoInfo モックを生成する。
 * Builds a minimal VideoInfo-like mock with basic_info, page, and getTranscript.
 */
function buildVideoInfoMock(opts: {
  basicInfo?: Record<string, unknown>;
  microformat?: Record<string, unknown>;
  transcriptSegments?: Array<{ start_ms: string; end_ms: string; text: string }>;
  transcriptError?: unknown;
}) {
  const transcriptInfo = opts.transcriptError
    ? null
    : {
        transcript: {
          content: {
            body: {
              initial_segments: (opts.transcriptSegments ?? []).map((s) => ({
                start_ms: s.start_ms,
                end_ms: s.end_ms,
                snippet: { toString: () => s.text },
              })),
            },
          },
        },
      };

  return {
    basic_info: opts.basicInfo ?? {},
    page: [{ microformat: opts.microformat }],
    getTranscript: vi.fn(() =>
      opts.transcriptError ? Promise.reject(opts.transcriptError) : Promise.resolve(transcriptInfo),
    ),
  };
}

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

  describe("fetchYouTubeContent", () => {
    beforeEach(() => {
      mockGetInfo.mockReset();
      mockCreate.mockReset();
      mockCreate.mockResolvedValue({ getInfo: mockGetInfo });
      __resetInnertubeForTesting();
    });

    afterEach(() => {
      __resetInnertubeForTesting();
    });

    it("returns metadata and transcript from a successful Innertube response", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: {
            title: "Test Video",
            short_description: "A test video description",
            channel: { id: "UCxxx", name: "Test Channel", url: "" },
            duration: 630, // 10:30
            thumbnail: [
              { url: "https://i.ytimg.com/vi/abc/default.jpg", width: 120, height: 90 },
              { url: "https://i.ytimg.com/vi/abc/maxres.jpg", width: 1280, height: 720 },
            ],
            tags: ["test", "video"],
          },
          microformat: { publish_date: "2024-01-15" },
          transcriptSegments: [
            { start_ms: "0", end_ms: "1500", text: "Hello" },
            { start_ms: "1500", end_ms: "3000", text: "world" },
          ],
        }),
      );

      const result = await fetchYouTubeContent("abc12345678");

      expect(result.metadata.title).toBe("Test Video");
      expect(result.metadata.description).toBe("A test video description");
      expect(result.metadata.channelTitle).toBe("Test Channel");
      expect(result.metadata.publishedAt).toBe("2024-01-15");
      expect(result.metadata.duration).toBe("PT10M30S");
      expect(result.metadata.thumbnailUrl).toBe("https://i.ytimg.com/vi/abc/maxres.jpg");
      expect(result.metadata.tags).toEqual(["test", "video"]);

      expect(result.transcript).toEqual([
        { text: "Hello", offset: 0, duration: 1.5 },
        { text: "world", offset: 1.5, duration: 1.5 },
      ]);
      expect(result.transcriptText).toBe("Hello world");
    });

    it("returns transcript=null when captions are unavailable", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: { title: "No Caps", duration: 60, channel: { name: "Ch", id: "", url: "" } },
          transcriptError: new Error("Transcript is disabled on this video"),
        }),
      );

      const result = await fetchYouTubeContent("noCaps12345");

      expect(result.metadata.title).toBe("No Caps");
      expect(result.transcript).toBeNull();
      expect(result.transcriptText).toBe("");
    });

    it("falls back to minimal metadata when getInfo throws", async () => {
      mockGetInfo.mockRejectedValueOnce(new Error("Video unavailable"));

      const result = await fetchYouTubeContent("badvideoXYZ");

      expect(result.metadata.title).toBe("YouTube Video (badvideoXYZ)");
      expect(result.metadata.description).toBe("");
      expect(result.metadata.thumbnailUrl).toBe(
        "https://img.youtube.com/vi/badvideoXYZ/hqdefault.jpg",
      );
      expect(result.transcript).toBeNull();
      expect(result.transcriptText).toBe("");
    });

    it("falls back to author when channel.name is missing", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: {
            title: "By author",
            author: "Author Name",
            channel: null,
            duration: 30,
          },
          transcriptError: new Error("none"),
        }),
      );

      const result = await fetchYouTubeContent("authorTest1");
      expect(result.metadata.channelTitle).toBe("Author Name");
    });

    it("falls back to minimal metadata when VideoInfo is malformed (contract: never throws)", async () => {
      // basic_info を欠いた VideoInfo を返し、extractMetadata が TypeError で落ちる状況を再現。
      // Simulate a malformed VideoInfo (missing basic_info) that makes
      // extractMetadata throw — the caller must still get a graceful fallback.
      mockGetInfo.mockResolvedValueOnce({
        // basic_info is intentionally absent
        page: [{}],
        getTranscript: vi.fn().mockRejectedValue(new Error("none")),
      });

      const result = await fetchYouTubeContent("malformed12");
      expect(result.metadata.title).toBe("YouTube Video (malformed12)");
      expect(result.metadata.thumbnailUrl).toBe(
        "https://img.youtube.com/vi/malformed12/hqdefault.jpg",
      );
      expect(result.transcript).toBeNull();
      expect(result.transcriptText).toBe("");
    });

    it("leaves duration empty when basic_info.duration is missing (no fabricated 0:00)", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: { title: "No duration" }, // no `duration` field
          transcriptError: new Error("none"),
        }),
      );

      const result = await fetchYouTubeContent("noDur123456");
      expect(result.metadata.duration).toBe("");
    });

    it("picks the widest thumbnail even when earlier array entries are null", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: {
            title: "Sparse thumbs",
            duration: 30,
            thumbnail: [
              null,
              { url: "https://i.ytimg.com/vi/abc/small.jpg", width: 120, height: 90 },
              { url: "https://i.ytimg.com/vi/abc/large.jpg", width: 1280, height: 720 },
            ] as unknown[],
          },
          transcriptError: new Error("none"),
        }),
      );

      const result = await fetchYouTubeContent("sparseThumb");
      expect(result.metadata.thumbnailUrl).toBe("https://i.ytimg.com/vi/abc/large.jpg");
    });

    it("uses hqdefault thumbnail when basic_info.thumbnail is empty", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: { title: "No thumb", duration: 30, thumbnail: [] },
          transcriptError: new Error("none"),
        }),
      );

      const result = await fetchYouTubeContent("noThumb1234");
      expect(result.metadata.thumbnailUrl).toBe(
        "https://img.youtube.com/vi/noThumb1234/hqdefault.jpg",
      );
    });

    it("retries Innertube.create after a transient initialisation failure", async () => {
      // 1 回目: create が失敗 → キャッシュをクリアして再試行可能になることを保証
      // First call rejects; the cache must clear so the next call retries Innertube.create.
      mockCreate.mockReset();
      mockCreate.mockRejectedValueOnce(new Error("transient init failure"));
      mockCreate.mockResolvedValueOnce({ getInfo: mockGetInfo });
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: { title: "Recovered", duration: 30 },
          transcriptError: new Error("none"),
        }),
      );

      const first = await fetchYouTubeContent("retryTest12");
      expect(first.metadata.title).toBe("YouTube Video (retryTest12)"); // minimal fallback

      const second = await fetchYouTubeContent("retryTest12");
      expect(second.metadata.title).toBe("Recovered");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("skips transcript segments with empty text or invalid timestamps", async () => {
      mockGetInfo.mockResolvedValueOnce(
        buildVideoInfoMock({
          basicInfo: { title: "Filter", duration: 30 },
          transcriptSegments: [
            { start_ms: "0", end_ms: "1000", text: "good" },
            { start_ms: "1000", end_ms: "2000", text: "   " },
            { start_ms: "not-a-number", end_ms: "3000", text: "broken" },
            { start_ms: "2000", end_ms: "3000", text: "alsoGood" },
          ],
        }),
      );

      const result = await fetchYouTubeContent("filter12345");
      expect(result.transcript).toEqual([
        { text: "good", offset: 0, duration: 1 },
        { text: "alsoGood", offset: 2, duration: 1 },
      ]);
      expect(result.transcriptText).toBe("good alsoGood");
    });
  });
});
