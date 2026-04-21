/**
 * App shell: header, main content (no left sidebar), mobile bottom nav,
 * and layout CSS variables.
 *
 * 共通レイアウト: ヘッダー・メイン（左サイドバーなし）・モバイルボトムナビ、
 * および CSS 変数。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppLayout } from "./AppLayout";
import { useIsMobile } from "@zedi/ui";

vi.mock("./Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));
vi.mock("./BottomNav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav">BottomNav</nav>,
}));

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
  };
});

describe("AppLayout", () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("renders Header and does not render a left sidebar on desktop", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav")).not.toBeInTheDocument();
  });

  it("renders children inside the main element", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByText("Main content"));
  });

  it("sets desktop layout CSS variables (--app-header-height: 4.5rem, --app-bottom-nav-height: 0px)", () => {
    const { container } = render(
      <AppLayout>
        <span>Content</span>
      </AppLayout>,
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper).toBeInTheDocument();
    const style = wrapper?.getAttribute("style") ?? "";
    expect(style).toContain("--app-header-height");
    expect(style).toContain("4.5rem");
    expect(style).toContain("--app-bottom-nav-height");
    expect(style).toContain("0px");
    expect(style).toContain("--ai-chat-width");
    expect(style).toContain("22rem");
  });

  it("renders BottomNav on mobile viewports", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
  });

  it("sets mobile layout CSS variables (--app-header-height: 3rem, --app-bottom-nav-height: 3.5rem)", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { container } = render(
      <AppLayout>
        <span>Content</span>
      </AppLayout>,
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    const style = wrapper?.getAttribute("style") ?? "";
    expect(style).toContain("--app-header-height");
    expect(style).toContain("3rem");
    expect(style).toContain("--app-bottom-nav-height");
    expect(style).toContain("3.5rem");
  });

  /**
   * Regression: on mobile, the bottom-nav + safe-area padding must live on
   * `<main>` (the scroll container), not on an intermediate wrapper. Putting
   * it on the wrapper clips the scroll region at the top edge of the
   * translucent BottomNav, which defeats its `backdrop-blur`.
   *
   * 回帰防止: モバイルでは BottomNav + safe-area 分の padding-bottom を
   * スクロールコンテナである `<main>` 自身に持たせる。ラッパー側に置くと
   * スクロール領域が BottomNav 上端で切り詰められ、`backdrop-blur` が機能
   * しなくなる。
   */
  it("puts bottom-nav + safe-area padding on <main> (scroll container), not on its wrapper, on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    const main = screen.getByRole("main");
    const mainStyle = main.getAttribute("style") ?? "";
    expect(mainStyle).toContain("padding-bottom");
    expect(mainStyle).toContain("--app-bottom-nav-height");
    expect(mainStyle).toContain("env(safe-area-inset-bottom)");

    const wrapper = main.parentElement;
    const wrapperStyle = wrapper?.getAttribute("style") ?? "";
    expect(wrapperStyle).not.toContain("padding-bottom");
  });

  it("does not set an inline padding-bottom on <main> on desktop", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    const main = screen.getByRole("main");
    const mainStyle = main.getAttribute("style") ?? "";
    expect(mainStyle).not.toContain("padding-bottom");
  });
});
