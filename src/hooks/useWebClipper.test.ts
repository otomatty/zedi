import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebClipper } from "./useWebClipper";
import type { ClippedContent } from "@/lib/webClipper";

const mockClipWebPage = vi.fn();
const mockGetClipErrorMessage = vi.fn();
const mockFormatClippedContentAsTiptap = vi.fn();

vi.mock("@/lib/webClipper", () => ({
  clipWebPage: (...args: unknown[]) => mockClipWebPage(...args),
  getClipErrorMessage: (...args: unknown[]) => mockGetClipErrorMessage(...args),
}));

vi.mock("@/lib/htmlToTiptap", () => ({
  formatClippedContentAsTiptap: (...args: unknown[]) => mockFormatClippedContentAsTiptap(...args),
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

describe("useWebClipper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClipErrorMessage.mockReturnValue("クリップ失敗");
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
    );
  });
});
