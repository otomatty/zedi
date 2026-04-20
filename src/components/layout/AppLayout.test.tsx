/**
 * App shell: header, main content (no left sidebar), right AI dock (desktop
 * only), mobile bottom nav, and layout CSS variables.
 *
 * 共通レイアウト: ヘッダー・メイン（左サイドバーなし）・右 AI ドック
 * （デスクトップのみ）・モバイルボトムナビ、および CSS 変数。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppLayout } from "./AppLayout";
import { useIsMobile } from "@zedi/ui";

vi.mock("./Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));
vi.mock("./AIChatDock", () => ({
  AIChatDock: () => <div data-testid="ai-chat-dock">AIChatDock</div>,
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

  it("renders Header and AIChatDock and does not render a left sidebar on desktop", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-dock")).toBeInTheDocument();
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

  it("renders BottomNav and hides AIChatDock on mobile viewports", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-chat-dock")).not.toBeInTheDocument();
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
});
