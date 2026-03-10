import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorRecommendationBar } from "./useEditorRecommendationBar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const editorRecommendationLabels: Record<string, string> = {
  labelRecommendation: "おすすめ",
  labelThumbnails: "サムネイル候補",
  generating: "画像を生成中",
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key.startsWith("editor.recommendation.")) {
        const sub = key.replace("editor.recommendation.", "");
        return editorRecommendationLabels[sub] ?? key;
      }
      return key;
    },
    i18n: { language: "ja" },
  }),
}));

import { useAuth } from "@/hooks/useAuth";

const defaultProps = {
  pageTitle: "Test Page",
  isReadOnly: false,
  hasThumbnail: false,
  onSelectThumbnail: vi.fn(),
};

describe("useEditorRecommendationBar", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.test.example.com");
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true } as never);
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], nextCursor: null }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("canSearch is false when isReadOnly", () => {
    const { result } = renderHook(() =>
      useEditorRecommendationBar({ ...defaultProps, isReadOnly: true }),
    );
    expect(result.current.canSearch).toBe(false);
  });

  it("canSearch is false when hasThumbnail", () => {
    const { result } = renderHook(() =>
      useEditorRecommendationBar({ ...defaultProps, hasThumbnail: true }),
    );
    expect(result.current.canSearch).toBe(false);
  });

  it("canSearch is true when not read-only and no thumbnail", () => {
    const { result } = renderHook(() => useEditorRecommendationBar(defaultProps));
    expect(result.current.canSearch).toBe(true);
    expect(result.current.mode).toBe("actions");
    expect(result.current.headerLabel).toBe("おすすめ");
  });

  it("dismiss sets isDismissed", () => {
    const { result } = renderHook(() => useEditorRecommendationBar(defaultProps));
    expect(result.current.isDismissed).toBe(false);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.isDismissed).toBe(true);
  });

  it("handleOpenThumbnailPicker switches to thumbnails mode", () => {
    const { result } = renderHook(() => useEditorRecommendationBar(defaultProps));
    expect(result.current.mode).toBe("actions");
    act(() => {
      result.current.handleOpenThumbnailPicker();
    });
    expect(result.current.mode).toBe("thumbnails");
    expect(result.current.headerLabel).toBe("サムネイル候補");
  });

  it("handleBackToActions switches back to actions", () => {
    const { result } = renderHook(() => useEditorRecommendationBar(defaultProps));
    act(() => {
      result.current.handleOpenThumbnailPicker();
    });
    expect(result.current.mode).toBe("thumbnails");
    act(() => {
      result.current.handleBackToActions();
    });
    expect(result.current.mode).toBe("actions");
  });

  it("handleSelectCandidate calls onSelectThumbnail and resets mode", () => {
    const onSelectThumbnail = vi.fn();
    const { result } = renderHook(() =>
      useEditorRecommendationBar({
        ...defaultProps,
        onSelectThumbnail,
      }),
    );
    const candidate = {
      id: "1",
      previewUrl: "https://p",
      imageUrl: "https://img",
      alt: "Alt",
      sourceName: "S",
      sourceUrl: "https://s",
    };
    act(() => {
      result.current.handleSelectCandidate(candidate);
    });
    expect(onSelectThumbnail).toHaveBeenCalledWith("https://img", "Alt", "https://p");
    expect(result.current.mode).toBe("actions");
  });
});
