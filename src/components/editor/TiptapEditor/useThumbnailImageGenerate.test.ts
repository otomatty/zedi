import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useThumbnailImageGenerate } from "./useThumbnailImageGenerate";

vi.stubEnv("VITE_API_BASE_URL", "https://api.test.example.com");

describe("useThumbnailImageGenerate", () => {
  const onSelectThumbnail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns error when trimmedTitle is empty", async () => {
    const { result } = renderHook(() => useThumbnailImageGenerate("", true, onSelectThumbnail));
    let err: string | null = null;
    await act(async () => {
      err = await result.current.generateImage();
    });
    expect(err).toBe("タイトルを入力してください");
    expect(onSelectThumbnail).not.toHaveBeenCalled();
  });

  it("returns error when not signed in", async () => {
    const { result } = renderHook(() =>
      useThumbnailImageGenerate("title", false, onSelectThumbnail),
    );
    let err: string | null = null;
    await act(async () => {
      err = await result.current.generateImage();
    });
    expect(err).toBe("ログインが必要です");
    expect(onSelectThumbnail).not.toHaveBeenCalled();
  });

  it("calls onSelectThumbnail and returns null on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          imageUrl: "data:image/png;base64,abc",
          mimeType: "image/png",
        }),
      }),
    );

    const { result } = renderHook(() =>
      useThumbnailImageGenerate("title", true, onSelectThumbnail),
    );

    let err: string | null = undefined as unknown as string | null;
    await act(async () => {
      err = await result.current.generateImage();
    });

    expect(err).toBeNull();
    expect(onSelectThumbnail).toHaveBeenCalledWith(
      "data:image/png;base64,abc",
      "title",
      "data:image/png;base64,abc",
    );

    vi.unstubAllGlobals();
  });

  it("returns error message on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server error" }),
      }),
    );

    const { result } = renderHook(() =>
      useThumbnailImageGenerate("title", true, onSelectThumbnail),
    );

    let err: string | null = undefined as unknown as string | null;
    await act(async () => {
      err = await result.current.generateImage();
    });

    expect(err).toBe("Server error");
    expect(onSelectThumbnail).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
