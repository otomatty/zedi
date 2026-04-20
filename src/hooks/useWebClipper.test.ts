import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebClipper } from "./useWebClipper";
import type { ClippedContent } from "@/lib/webClipper";
import type { ApiClient } from "@/lib/api/apiClient";
import type { AISettings } from "@/types/ai";

const mockClipWebPage = vi.fn();
const mockGetClipErrorMessage = vi.fn();
const mockFormatClippedContentAsTiptap = vi.fn();
const mockIsYouTubeUrl = vi.fn();
const mockLoadAISettings = vi.fn();

vi.mock("@/lib/webClipper", () => ({
  clipWebPage: (...args: unknown[]) => mockClipWebPage(...args),
  getClipErrorMessage: (...args: unknown[]) => mockGetClipErrorMessage(...args),
}));

vi.mock("@/lib/htmlToTiptap", () => ({
  formatClippedContentAsTiptap: (...args: unknown[]) => mockFormatClippedContentAsTiptap(...args),
}));

vi.mock("@/components/editor/utils/urlTransform", () => ({
  isYouTubeUrl: (...args: unknown[]) => mockIsYouTubeUrl(...args),
}));

vi.mock("@/lib/aiSettings", () => ({
  loadAISettings: (...args: unknown[]) => mockLoadAISettings(...args),
  getDefaultAISettings: (): AISettings => ({
    provider: "google",
    apiKey: "",
    apiMode: "api_server",
    model: "gemini-3-flash-preview",
    modelId: "google:gemini-3-flash-preview",
    isConfigured: false,
  }),
}));

const fakeContent: ClippedContent = {
  title: "Test Page",
  content: "<p>Hello</p>",
  textContent: "Hello",
  excerpt: "A test page",
  byline: "Author",
  siteName: "TestSite",
  thumbnailUrl: "https://example.com/thumb.png",
  sourceUrl: "https://example.com",
};

const fakeYouTubeResult = {
  title: "YouTube Test",
  thumbnailUrl: "https://img.youtube.com/vi/abc12345678/hqdefault.jpg",
  tiptapJson: { type: "doc", content: [{ type: "paragraph" }] },
  contentText: "YouTube summary text",
  contentHash: "abc123",
  sourceUrl: "https://www.youtube.com/watch?v=abc12345678",
};

describe("useWebClipper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClipErrorMessage.mockReturnValue("クリップ失敗");
    mockIsYouTubeUrl.mockReturnValue(false);
    mockLoadAISettings.mockResolvedValue(null);
  });

  it("initial state is idle with null content", () => {
    const { result } = renderHook(() => useWebClipper());
    expect(result.current.status).toBe("idle");
    expect(result.current.clippedContent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clip sets status to extracting then completed", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.clippedContent).toEqual(fakeContent);
    expect(result.current.error).toBeNull();
  });

  it("clip sets error on failure", async () => {
    mockClipWebPage.mockRejectedValue(new Error("fetch failed"));
    mockGetClipErrorMessage.mockReturnValue("ネットワークエラー");
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("ネットワークエラー");
    expect(result.current.clippedContent).toBeNull();
  });

  it("passes persisted AI settings to the YouTube clip endpoint", async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockLoadAISettings.mockResolvedValue({
      provider: "openai",
      apiKey: "",
      apiMode: "api_server",
      model: "gpt-5-mini",
      modelId: "openai:gpt-5-mini",
      isConfigured: true,
    } satisfies AISettings);

    const clipYoutube = vi.fn().mockResolvedValue(fakeYouTubeResult);
    const api = {
      clipFetchHtml: vi.fn(),
      clipYoutube,
    } as unknown as ApiClient;

    const { result } = renderHook(() => useWebClipper({ api }));

    await act(async () => {
      await result.current.clip("https://youtu.be/abc12345678");
    });

    expect(clipYoutube).toHaveBeenCalledWith("https://youtu.be/abc12345678", {
      provider: "openai",
      model: "openai:gpt-5-mini",
    });
    expect(result.current.clippedContent).toMatchObject({
      title: "YouTube Test",
      siteName: "YouTube",
      content: JSON.stringify(fakeYouTubeResult.tiptapJson),
    });
  });

  it("falls back to default server AI settings for YouTube clip requests", async () => {
    mockIsYouTubeUrl.mockReturnValue(true);

    const clipYoutube = vi.fn().mockResolvedValue(fakeYouTubeResult);
    const api = {
      clipFetchHtml: vi.fn(),
      clipYoutube,
    } as unknown as ApiClient;

    const { result } = renderHook(() => useWebClipper({ api }));

    await act(async () => {
      await result.current.clip("https://www.youtube.com/watch?v=abc12345678");
    });

    expect(clipYoutube).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc12345678", {
      provider: "google",
      model: "google:gemini-3-flash-preview",
    });
    expect(result.current.status).toBe("completed");
  });

  it("reset returns to idle state", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });
    expect(result.current.status).toBe("completed");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.clippedContent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("getTiptapContent returns null when no content", () => {
    const { result } = renderHook(() => useWebClipper());
    expect(result.current.getTiptapContent()).toBeNull();
  });

  it("getTiptapContent returns JSON string when content exists", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    mockFormatClippedContentAsTiptap.mockReturnValue({ type: "doc", content: [] });
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    const tiptap = result.current.getTiptapContent();
    expect(tiptap).toBe(JSON.stringify({ type: "doc", content: [] }));
    expect(mockFormatClippedContentAsTiptap).toHaveBeenCalledWith(
      fakeContent.content,
      fakeContent.sourceUrl,
      fakeContent.siteName,
      fakeContent.thumbnailUrl,
      fakeContent.title,
      undefined,
    );
  });

  it("getTiptapContent passes thumbnailUrl and storageProviderId when provided", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    mockFormatClippedContentAsTiptap.mockReturnValue({ type: "doc", content: [] });
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    result.current.getTiptapContent("https://committed.com/thumb.png", "s3");
    expect(mockFormatClippedContentAsTiptap).toHaveBeenCalledWith(
      fakeContent.content,
      fakeContent.sourceUrl,
      fakeContent.siteName,
      "https://committed.com/thumb.png",
      fakeContent.title,
      "s3",
    );
  });

  it("getTiptapContent suppresses thumbnail when null is explicitly passed", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    mockFormatClippedContentAsTiptap.mockReturnValue({ type: "doc", content: [] });
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    result.current.getTiptapContent(null);
    expect(mockFormatClippedContentAsTiptap).toHaveBeenCalledWith(
      fakeContent.content,
      fakeContent.sourceUrl,
      fakeContent.siteName,
      null,
      fakeContent.title,
      undefined,
    );
  });

  it("getTiptapContent passes thumbnailUrl override when provided", async () => {
    mockClipWebPage.mockResolvedValue(fakeContent);
    mockFormatClippedContentAsTiptap.mockReturnValue({ type: "doc", content: [] });
    const { result } = renderHook(() => useWebClipper());

    await act(async () => {
      await result.current.clip("https://example.com");
    });

    result.current.getTiptapContent("https://committed.com/thumb.png");
    expect(mockFormatClippedContentAsTiptap).toHaveBeenCalledWith(
      fakeContent.content,
      fakeContent.sourceUrl,
      fakeContent.siteName,
      "https://committed.com/thumb.png",
      fakeContent.title,
      undefined,
    );
  });
});
