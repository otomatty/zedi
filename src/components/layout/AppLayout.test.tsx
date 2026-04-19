/**
 * App shell: header, main content (no left sidebar), right AI dock; CSS variables.
 * 共通レイアウト: ヘッダー・メイン（左サイドバーなし）・右 AI ドック、CSS 変数。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppLayout } from "./AppLayout";

vi.mock("./Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));
vi.mock("./AIChatDock", () => ({
  AIChatDock: () => <div data-testid="ai-chat-dock">AIChatDock</div>,
}));

describe("AppLayout", () => {
  it("renders Header and AIChatDock and does not render a left sidebar", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
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

  it("sets layout CSS variables on the layout wrapper (--app-header-height, --ai-chat-width)", () => {
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
    expect(style).toContain("--ai-chat-width");
    expect(style).toContain("22rem");
  });
});
