/**
 * articleExtractor の単体テスト。
 * 純粋ヘルパー（extractTextFromTiptap / extractYouTubeVideoId / buildArticleSchema）と、
 * extractArticleFromUrl の配線を検証する。HTTP 取得 (clipServerFetch) と
 * YouTube 抽出 (youtubeExtractor) はモックし、Readability / Tiptap は実物を使う。
 *
 * Unit tests for articleExtractor. Pure helpers are checked directly; the
 * extractArticleFromUrl wiring is exercised with the HTTP fetch and the
 * YouTube extractor mocked, while Readability / Tiptap run for real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// HTTP 取得だけをモックし、ClipFetchBlockedError は本物を残す（instanceof 判定のため）。
// Mock only the fetch; keep the real ClipFetchBlockedError so instanceof works.
vi.mock("../../lib/clipServerFetch.js", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/clipServerFetch.js")>();
  return { ...actual, fetchClipHtmlWithRedirects: vi.fn() };
});
vi.mock("../../services/youtubeExtractor.js", () => ({
  extractYouTubeContent: vi.fn(),
}));

import { ClipFetchBlockedError, fetchClipHtmlWithRedirects } from "../../lib/clipServerFetch.js";
import { extractYouTubeContent } from "../../services/youtubeExtractor.js";
import {
  buildArticleSchema,
  extractArticleFromUrl,
  extractTextFromTiptap,
  extractYouTubeVideoId,
  type TiptapNode,
} from "../../services/articleExtractor.js";

const mockFetchHtml = vi.mocked(fetchClipHtmlWithRedirects);
const mockYouTube = vi.mocked(extractYouTubeContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractTextFromTiptap", () => {
  it("null ノードは空文字を返す / returns empty string for a null node", () => {
    expect(extractTextFromTiptap(null)).toBe("");
  });

  it("text ノードはその文字列を返す / returns the literal text of a text node", () => {
    expect(extractTextFromTiptap({ type: "text", text: "hello" })).toBe("hello");
  });

  it("content が無いノードは空文字 / returns empty string when there is no content", () => {
    expect(extractTextFromTiptap({ type: "paragraph" })).toBe("");
  });

  it("ネストした content を結合し空白を圧縮する / joins nested content and collapses whitespace", () => {
    const node: TiptapNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "foo" }] },
        { type: "paragraph", content: [{ type: "text", text: "bar   baz" }] },
      ],
    };

    expect(extractTextFromTiptap(node)).toBe("foo bar baz");
  });
});

describe("extractYouTubeVideoId", () => {
  it.each([
    ["watch URL", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtu.be 短縮 URL", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["embed URL", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["shorts URL", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    [
      "watch + 追加クエリ",
      "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ],
  ])("動画 ID を抽出する: %s / extracts the video id", (_label, url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it.each([
    ["YouTube でない URL", "https://example.com/watch?v=dQw4w9WgXcQ"],
    ["ID が短すぎる", "https://youtu.be/short"],
    ["プレーンな文字列", "not a url"],
  ])("YouTube でなければ null を返す: %s / returns null for non-YouTube urls", (_label, url) => {
    expect(extractYouTubeVideoId(url)).toBeNull();
  });
});

describe("buildArticleSchema", () => {
  it("Tiptap スキーマを構築し doc/paragraph ノードを含む / builds a schema exposing doc and paragraph nodes", () => {
    const schema = buildArticleSchema();
    expect(schema.nodes.doc).toBeDefined();
    expect(schema.nodes.paragraph).toBeDefined();
  });
});

describe("extractArticleFromUrl", () => {
  // Readability がパースできる十分な本文を持つ記事 HTML。
  // Article HTML with enough prose for Readability to parse.
  const ARTICLE_HTML = `<!doctype html><html><head>
      <title>Sample Article Title</title>
      <meta property="og:image" content="/cover.png" />
    </head><body>
      <article>
        <h1>Sample Article Title</h1>
        <p>This is the first substantial paragraph of the article body. It contains
           enough words for Mozilla Readability to treat it as the main content and
           not discard it as boilerplate navigation text.</p>
        <p>Here is a second paragraph that continues the discussion with more prose
           so the readability score for this container stays comfortably positive
           and the article is extracted successfully during the test run.</p>
      </article>
    </body></html>`;

  it("YouTube URL は専用パイプラインへ委譲する / delegates YouTube URLs to the dedicated pipeline", async () => {
    const youtubeResult = {
      finalUrl: "https://youtu.be/dQw4w9WgXcQ",
      title: "Yt",
      thumbnailUrl: null,
      tiptapJson: { type: "doc", content: [] },
      contentText: "",
      contentHash: "hash",
      aiUsage: null,
    };
    mockYouTube.mockResolvedValue(youtubeResult);

    const result = await extractArticleFromUrl({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtubeApiKey: "yt-key",
      aiProvider: "openai",
      aiModel: "gpt-4o",
      aiApiKey: "sk-ai",
      previewLength: 50,
    });

    expect(result).toBe(youtubeResult);
    expect(mockYouTube).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      youtubeApiKey: "yt-key",
      aiProvider: "openai",
      aiModel: "gpt-4o",
      aiApiKey: "sk-ai",
      previewLength: 50,
    });
    // 通常記事の取得経路は呼ばれない。
    // The article fetch path is not used for YouTube URLs.
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it("通常記事を取得して Tiptap JSON・プレビュー・ハッシュを返す / fetches a normal article and returns Tiptap JSON, preview and hash", async () => {
    mockFetchHtml.mockResolvedValue({
      html: ARTICLE_HTML,
      finalUrl: "https://blog.example.com/post",
      contentType: "text/html",
    });

    const result = await extractArticleFromUrl({
      url: "https://blog.example.com/post",
      previewLength: 30,
    });

    expect(result.finalUrl).toBe("https://blog.example.com/post");
    expect(result.title).toBe("Sample Article Title");
    // og:image の相対 URL は finalUrl を基準に絶対化される。
    // The relative og:image is resolved against finalUrl.
    expect(result.thumbnailUrl).toBe("https://blog.example.com/cover.png");
    // 先頭に OGP 画像ノードが差し込まれる。
    // The OGP image node is prepended to the document content.
    expect(result.tiptapJson.type).toBe("doc");
    expect(result.tiptapJson.content?.[0]).toEqual({
      type: "image",
      attrs: { src: "https://blog.example.com/cover.png", alt: "Sample Article Title" },
    });
    // contentText は previewLength で切り詰められる。
    // contentText is truncated to previewLength characters.
    expect(result.contentText).toHaveLength(30);
    // contentHash は本文の SHA-256（64 桁の 16 進）。
    // contentHash is a SHA-256 hex digest (64 chars).
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.aiUsage).toBeUndefined();
  });

  it("og:image が無ければ thumbnailUrl は null で画像ノードを差し込まない / no thumbnail node when og:image is absent", async () => {
    const noImageHtml = ARTICLE_HTML.replace(/<meta property="og:image"[^>]*>/, "");
    mockFetchHtml.mockResolvedValue({
      html: noImageHtml,
      finalUrl: "https://blog.example.com/p2",
      contentType: "text/html",
    });

    const result = await extractArticleFromUrl({ url: "https://blog.example.com/p2" });

    expect(result.thumbnailUrl).toBeNull();
    expect(result.tiptapJson.content?.[0]?.type).not.toBe("image");
  });

  it("ClipFetchBlockedError はそのまま伝播する / propagates ClipFetchBlockedError unchanged", async () => {
    mockFetchHtml.mockRejectedValue(new ClipFetchBlockedError("blocked host"));

    await expect(
      extractArticleFromUrl({ url: "https://blocked.example.com" }),
    ).rejects.toBeInstanceOf(ClipFetchBlockedError);
  });

  it("ブロック以外の取得エラーもそのまま伝播する / propagates non-blocked fetch errors as well", async () => {
    mockFetchHtml.mockRejectedValue(new Error("ECONNRESET"));

    await expect(extractArticleFromUrl({ url: "https://flaky.example.com" })).rejects.toThrow(
      "ECONNRESET",
    );
  });

  it("Readability が本文を抽出できなければエラーを投げる / throws when Readability cannot extract content", async () => {
    mockFetchHtml.mockResolvedValue({
      html: "<html><body></body></html>",
      finalUrl: "https://empty.example.com",
      contentType: "text/html",
    });

    await expect(extractArticleFromUrl({ url: "https://empty.example.com" })).rejects.toThrow(
      "Failed to extract article content",
    );
  });
});
