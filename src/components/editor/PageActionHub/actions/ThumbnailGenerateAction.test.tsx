import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThumbnailGenerateAction } from "./ThumbnailGenerateAction";
import type { PageActionContext } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageActionHub.actions.thumbnailGenerate.loading": "Generating image...",
        "editor.pageActionHub.actions.thumbnailGenerate.retry": "Regenerate",
        "editor.pageActionHub.actions.thumbnailGenerate.missingTitle": "Please enter a title",
      };
      return map[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

function makeCtx(overrides: Partial<PageActionContext> = {}): PageActionContext {
  return {
    pageTitle: "Test Page",
    isReadOnly: false,
    isSignedIn: true,
    hasThumbnail: false,
    insertThumbnail: vi.fn(),
    ...overrides,
  };
}

const baseHandlers = () => ({
  onClose: vi.fn(),
  onBackToList: vi.fn(),
});

describe("ThumbnailGenerateAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("マウント時に画像生成 API を自動で呼ぶ / fires the generate request on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageUrl: "https://example.com/img.png", mimeType: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ThumbnailGenerateAction ctx={makeCtx()} {...baseHandlers()} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/thumbnail/image-generate"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
    });
  });

  it("成功すると insertThumbnail と onClose が呼ばれる / on success inserts and closes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ imageUrl: "https://example.com/img.png", mimeType: "image/png" }),
      }),
    );
    const ctx = makeCtx();
    const handlers = baseHandlers();
    render(<ThumbnailGenerateAction ctx={ctx} {...handlers} />);

    await waitFor(() => {
      expect(ctx.insertThumbnail).toHaveBeenCalledWith(
        "https://example.com/img.png",
        "Test Page",
        "https://example.com/img.png",
      );
    });
    await waitFor(() => {
      expect(handlers.onClose).toHaveBeenCalled();
    });
  });

  it("エラー時は retry が表示されクリックで再リクエスト / shows retry on error and retries", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imageUrl: "https://example.com/img2.png", mimeType: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ctx = makeCtx();
    render(<ThumbnailGenerateAction ctx={ctx} {...baseHandlers()} />);

    const retry = await screen.findByRole("button", { name: "Regenerate" });
    await user.click(retry);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("タイトルが空のときは fetch せず警告 / no fetch and warns when title is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ThumbnailGenerateAction ctx={makeCtx({ pageTitle: "   " })} {...baseHandlers()} />);

    await screen.findByText("Please enter a title");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when generation has already started once", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ imageUrl: "https://example.com/img.png", mimeType: "image/png" }),
        }),
      );
    });

    it("StrictMode の二重マウントでも 1 回のみ生成する / dedup multi-effect calls", async () => {
      const ctx = makeCtx();
      const { unmount } = render(<ThumbnailGenerateAction ctx={ctx} {...baseHandlers()} />);

      await waitFor(() => {
        expect(ctx.insertThumbnail).toHaveBeenCalledTimes(1);
      });
      unmount();
    });
  });
});
