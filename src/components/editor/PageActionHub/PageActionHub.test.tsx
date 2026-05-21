import React, { useRef, useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useIsMobile } from "@zedi/ui";
import { PageActionHub } from "./PageActionHub";
import type { PageActionContext, PageActionHubHandle } from "./types";

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageActionHub.title": "Page actions",
        "editor.pageActionHub.back": "Back",
        "editor.pageActionHub.close": "Close",
        "editor.pageActionHub.emptyState": "No actions available",
        "editor.pageActionHub.actions.thumbnailSearch.label": "Search image",
        "editor.pageActionHub.actions.thumbnailSearch.description": "Search and insert",
        "editor.pageActionHub.actions.thumbnailSearch.loading": "Searching images...",
        "editor.pageActionHub.actions.thumbnailSearch.empty": "No candidates found",
        "editor.pageActionHub.actions.thumbnailSearch.next": "Next",
        "editor.pageActionHub.actions.thumbnailSearch.retry": "Retry",
        "editor.pageActionHub.actions.thumbnailGenerate.label": "Generate with AI",
        "editor.pageActionHub.actions.thumbnailGenerate.description": "Generate and insert",
        "editor.pageActionHub.actions.thumbnailGenerate.loading": "Generating image...",
        "editor.pageActionHub.actions.thumbnailGenerate.retry": "Regenerate",
        "editor.pageActionHub.actions.thumbnailGenerate.missingTitle": "Please enter a title",
      };
      return map[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

const makeCtx = (overrides: Partial<PageActionContext> = {}): PageActionContext => ({
  pageTitle: "Test Page",
  isReadOnly: false,
  isSignedIn: true,
  hasThumbnail: false,
  insertThumbnail: vi.fn(),
  ...overrides,
});

/**
 * テストハーネス: `hubRef` を生やしてレンダー直後に `open()` できるようにする。
 * Test harness: assigns hubRef and exposes `open()` for tests via a button.
 */
const Harness: React.FC<{
  ctx: PageActionContext;
  onMount?: (handle: PageActionHubHandle) => void;
}> = ({ ctx, onMount }) => {
  const ref = useRef<PageActionHubHandle | null>(null);
  useEffect(() => {
    if (ref.current && onMount) onMount(ref.current);
  }, [onMount]);
  return (
    <>
      <button type="button" data-testid="open-trigger" onClick={() => ref.current?.open()}>
        open
      </button>
      <PageActionHub ctx={ctx} hubRef={ref} />
    </>
  );
};

describe("PageActionHub", () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], nextCursor: null }),
      }),
    );
  });

  it("初期は閉じており Dialog 要素は描画されない / closed initially renders no dialog", () => {
    render(<Harness ctx={makeCtx()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("デスクトップでは Dialog として開く / opens as Dialog on desktop", async () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx()} />);

    await user.click(screen.getByTestId("open-trigger"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Page actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search image/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate with AI/ })).toBeInTheDocument();
  });

  it("モバイルでは Drawer として開く / opens as Drawer on mobile", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx()} />);

    await user.click(screen.getByTestId("open-trigger"));

    // Drawer (vaul) ロールも dialog なので、ハブ専用のラッパーを data-testid で識別する
    // Drawer (vaul) also uses role="dialog"; identify via our wrapper testid.
    expect(await screen.findByTestId("page-action-hub-drawer")).toBeInTheDocument();
    expect(screen.getByText("Page actions")).toBeInTheDocument();
  });

  it("カードクリックで詳細ビューに遷移する / clicking a card navigates to detail", async () => {
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx()} />);

    await user.click(screen.getByTestId("open-trigger"));
    await user.click(screen.getByRole("button", { name: /Search image/ }));

    // 詳細ビューでは一覧の他カードが消える
    // The list cards disappear when the detail view is active.
    expect(screen.queryByRole("button", { name: /Generate with AI/ })).not.toBeInTheDocument();
    // 戻るボタンが出る
    // Back button appears.
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("Back で list に戻る / Back button returns to list", async () => {
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx()} />);

    await user.click(screen.getByTestId("open-trigger"));
    await user.click(screen.getByRole("button", { name: /Search image/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: /Generate with AI/ })).toBeInTheDocument();
  });

  it("空ガード: 利用不可コンテキストでは emptyState を表示 / empty state when no actions available", async () => {
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx({ hasThumbnail: true })} />);

    await user.click(screen.getByTestId("open-trigger"));

    expect(await screen.findByText("No actions available")).toBeInTheDocument();
  });

  it("ハンドルの close() で閉じ、再オープン時は list / close() then reopen lands on list", async () => {
    let handle: PageActionHubHandle | null = null;
    const onMount = (h: PageActionHubHandle) => {
      handle = h;
    };
    const user = userEvent.setup();
    render(<Harness ctx={makeCtx()} onMount={onMount} />);

    await user.click(screen.getByTestId("open-trigger"));
    await user.click(screen.getByRole("button", { name: /Search image/ }));

    await waitFor(() => expect(handle).not.toBeNull());

    // close() を呼ぶ
    // Call close() through the imperative handle.
    handle?.close();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // 再オープン → list に戻っているはず
    // Reopen and confirm the list view is shown (not the previous detail view).
    await user.click(screen.getByTestId("open-trigger"));
    expect(await screen.findByRole("button", { name: /Generate with AI/ })).toBeInTheDocument();
  });
});
