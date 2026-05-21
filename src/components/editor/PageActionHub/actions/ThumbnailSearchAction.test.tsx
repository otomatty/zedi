import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThumbnailSearchAction } from "./ThumbnailSearchAction";
import type { PageActionContext } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageActionHub.actions.thumbnailSearch.loading": "Searching images...",
        "editor.pageActionHub.actions.thumbnailSearch.empty": "No candidates found",
        "editor.pageActionHub.actions.thumbnailSearch.next": "Next",
        "editor.pageActionHub.actions.thumbnailSearch.retry": "Retry",
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

describe("ThumbnailSearchAction", () => {
  beforeEach(() => {
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
    vi.restoreAllMocks();
  });

  it("マウント時に検索 API を自動で呼ぶ / fires the search request on mount", async () => {
    const ctx = makeCtx();
    const handlers = baseHandlers();
    render(<ThumbnailSearchAction ctx={ctx} {...handlers} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/thumbnail/image-search?query=Test+Page&limit=10"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("候補が返ると一覧表示する / renders returned candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "1",
              previewUrl: "https://example.com/p.jpg",
              imageUrl: "https://example.com/f.jpg",
              alt: "Cat",
              sourceName: "Unsplash",
              sourceUrl: "https://example.com",
            },
          ],
          nextCursor: null,
        }),
      }),
    );

    render(<ThumbnailSearchAction ctx={makeCtx()} {...baseHandlers()} />);

    await screen.findByAltText("Cat");
    expect(screen.getByText("Unsplash")).toBeInTheDocument();
  });

  it("候補クリックで insertThumbnail と onClose を呼ぶ / clicking a candidate inserts and closes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "1",
              previewUrl: "https://example.com/p.jpg",
              imageUrl: "https://example.com/f.jpg",
              alt: "Cat",
              sourceName: "Unsplash",
              sourceUrl: "https://example.com",
            },
          ],
          nextCursor: null,
        }),
      }),
    );
    const user = userEvent.setup();
    const ctx = makeCtx();
    const handlers = baseHandlers();
    render(<ThumbnailSearchAction ctx={ctx} {...handlers} />);

    await user.click(await screen.findByAltText("Cat"));

    expect(ctx.insertThumbnail).toHaveBeenCalledWith(
      "https://example.com/f.jpg",
      "Cat",
      "https://example.com/p.jpg",
    );
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("空の場合は empty メッセージを出す / shows empty state when no candidates returned", async () => {
    render(<ThumbnailSearchAction ctx={makeCtx()} {...baseHandlers()} />);
    await screen.findByText("No candidates found");
  });

  it("Next ボタンで cursor つき再リクエスト / next button paginates with cursor", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "1",
            previewUrl: "p1",
            imageUrl: "f1",
            alt: "a1",
            sourceName: "s1",
            sourceUrl: "u1",
          },
        ],
        nextCursor: "c2",
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ThumbnailSearchAction ctx={makeCtx()} {...baseHandlers()} />);

    await screen.findByAltText("a1");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[0]).toContain("cursor=c2");
    });
  });
});
