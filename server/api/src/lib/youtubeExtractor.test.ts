/**
 * youtubeExtractor の単体テスト。
 * Unit tests for YouTube content extractor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../services/youtubeService.js", () => ({
  fetchYouTubeContent: vi.fn(),
  formatDuration: vi.fn((iso: string) => {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return iso;
    const h = parseInt(match[1] || "0");
    const m = parseInt(match[2] || "0");
    const s = parseInt(match[3] || "0");
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }),
}));

vi.mock("../services/aiProviders.js", () => ({
  callProvider: vi.fn(),
}));

import { extractYouTubeContent } from "./youtubeExtractor.js";
import { fetchYouTubeContent } from "../services/youtubeService.js";
import { callProvider } from "../services/aiProviders.js";

const mockFetchYouTubeContent = vi.mocked(fetchYouTubeContent);
const mockCallProvider = vi.mocked(callProvider);

describe("youtubeExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseMetadata = {
    title: "テスト動画",
    description: "テスト説明文",
    channelTitle: "テストチャンネル",
    publishedAt: "2024-06-15T12:00:00Z",
    duration: "PT10M30S",
    thumbnailUrl: "https://img.youtube.com/vi/abc12345678/hqdefault.jpg",
    tags: ["test"],
  };

  it("generates Tiptap JSON with YouTube embed at the top", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: null,
      transcriptText: "",
    });

    const result = await extractYouTubeContent({ videoId: "abc12345678" });

    expect(result.finalUrl).toBe("https://www.youtube.com/watch?v=abc12345678");
    expect(result.title).toBe("テスト動画");
    expect(result.thumbnailUrl).toBe("https://img.youtube.com/vi/abc12345678/hqdefault.jpg");

    // Tiptap JSON の先頭ノードが youtubeEmbed であること
    // First node must be youtubeEmbed
    const doc = result.tiptapJson;
    expect(doc.type).toBe("doc");
    expect(doc.content).toBeDefined();
    const firstNode = (doc.content ?? [])[0];
    expect(firstNode).toBeDefined();
    expect(firstNode?.type).toBe("youtubeEmbed");
    expect(firstNode?.attrs?.videoId).toBe("abc12345678");
  });

  it("includes AI summary when provider is configured and transcript exists", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: [{ text: "Hello world", offset: 0, duration: 2 }],
      transcriptText:
        "This is a long enough transcript text that exceeds the minimum fifty character requirement for AI summarization.",
    });

    mockCallProvider.mockResolvedValueOnce({
      content: "## 要約\n\n- ポイント1\n- ポイント2",
      usage: { inputTokens: 100, outputTokens: 50 },
      finishReason: "stop",
    });

    const result = await extractYouTubeContent({
      videoId: "abc12345678",
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: "test-key",
    });

    // AI が呼ばれたことを確認 / Verify AI was called
    expect(mockCallProvider).toHaveBeenCalledOnce();

    // 要約セクションが含まれること / Summary section exists
    const headings = (result.tiptapJson.content ?? []).filter(
      (n) => n.type === "heading" && n.content?.[0]?.text?.includes("要約"),
    );
    expect(headings.length).toBeGreaterThan(0);
  });

  it("skips AI summary when no provider configured", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: [{ text: "Hello world", offset: 0, duration: 2 }],
      transcriptText: "Some transcript text here that is long enough.",
    });

    const result = await extractYouTubeContent({ videoId: "abc12345678" });

    expect(mockCallProvider).not.toHaveBeenCalled();

    // 要約セクションが含まれないこと / No summary section
    const summaryHeadings = (result.tiptapJson.content ?? []).filter(
      (n) => n.type === "heading" && n.content?.[0]?.text?.includes("要約"),
    );
    expect(summaryHeadings.length).toBe(0);
  });

  it("continues without summary when AI call fails", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: [{ text: "Hello", offset: 0, duration: 1 }],
      transcriptText:
        "This is a long enough transcript text that exceeds the minimum fifty character requirement for AI summarization.",
    });

    mockCallProvider.mockRejectedValueOnce(new Error("API error"));

    const result = await extractYouTubeContent({
      videoId: "abc12345678",
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: "test-key",
    });

    // エラーが throw されないこと / No error thrown
    expect(result.title).toBe("テスト動画");
    expect((result.tiptapJson.content ?? [])[0]?.type).toBe("youtubeEmbed");
  });

  it("includes transcript section when transcript is available", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: [{ text: "字幕テキスト", offset: 0, duration: 2 }],
      transcriptText: "字幕テキスト",
    });

    const result = await extractYouTubeContent({ videoId: "abc12345678" });

    // 字幕セクションが含まれること / Transcript section exists
    const transcriptHeadings = (result.tiptapJson.content ?? []).filter(
      (n) => n.type === "heading" && n.content?.[0]?.text?.includes("字幕"),
    );
    expect(transcriptHeadings.length).toBeGreaterThan(0);
  });

  it("generates proper content hash", async () => {
    mockFetchYouTubeContent.mockResolvedValueOnce({
      metadata: baseMetadata,
      transcript: null,
      transcriptText: "",
    });

    const result = await extractYouTubeContent({ videoId: "abc12345678" });

    // contentHash が SHA-256 ハッシュ形式であること / contentHash is SHA-256
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
