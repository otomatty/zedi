import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useThumbnailImageSearch } from "./useThumbnailImageSearch";

describe("useThumbnailImageSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() =>
      useThumbnailImageSearch("title", true, "https://api.test/"),
    );
    expect(result.current.candidates).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it("sets error when trimmedTitle is empty", async () => {
    const { result } = renderHook(() => useThumbnailImageSearch("", true, "https://api.test/"));
    await act(async () => {
      await result.current.loadCandidates();
    });
    expect(result.current.errorMessage).toBe("タイトルを入力してください");
    expect(result.current.isLoading).toBe(false);
  });

  it("sets error when not signed in", async () => {
    const { result } = renderHook(() =>
      useThumbnailImageSearch("query", false, "https://api.test/"),
    );
    await act(async () => {
      await result.current.loadCandidates();
    });
    expect(result.current.errorMessage).toBe("ログインが必要です");
    expect(result.current.isLoading).toBe(false);
  });

  it("loads candidates on success", async () => {
    const mockItems = [
      {
        id: "1",
        previewUrl: "https://a.com/p.jpg",
        imageUrl: "https://a.com/full.jpg",
        alt: "Alt",
        sourceName: "Source",
        sourceUrl: "https://a.com",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: mockItems, nextCursor: null }),
      }),
    );

    const { result } = renderHook(() =>
      useThumbnailImageSearch("query", true, "https://api.test/"),
    );

    await act(async () => {
      await result.current.loadCandidates();
    });

    expect(result.current.candidates).toEqual(mockItems);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isLoading).toBe(false);

    vi.unstubAllGlobals();
  });

  it("sets error on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() =>
      useThumbnailImageSearch("query", true, "https://api.test/"),
    );

    await act(async () => {
      await result.current.loadCandidates();
    });

    expect(result.current.errorMessage).toBe("画像検索に失敗しました: 500");
    expect(result.current.isLoading).toBe(false);

    vi.unstubAllGlobals();
  });

  it("resetSearch clears state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: "1", previewUrl: "", imageUrl: "", alt: "", sourceName: "", sourceUrl: "" },
          ],
          nextCursor: null,
        }),
      }),
    );

    const { result } = renderHook(() =>
      useThumbnailImageSearch("query", true, "https://api.test/"),
    );

    await act(async () => {
      await result.current.loadCandidates();
    });
    expect(result.current.candidates).toHaveLength(1);

    act(() => {
      result.current.resetSearch();
    });
    expect(result.current.candidates).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.errorMessage).toBeNull();

    vi.unstubAllGlobals();
  });
});
