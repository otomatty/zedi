/**
 * App shell: header, left sidebar, main, right AI dock; CSS variables; SidebarProvider defaultOpen false.
 * 共通レイアウト: ヘッダー・左サイドバー・メイン・右 AI ドック、CSS 変数、SidebarProvider defaultOpen false。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppLayout } from "./AppLayout";

const capturedSidebarProviderProps = vi.hoisted(() => ({
  current: {} as { defaultOpen?: boolean },
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    SidebarProvider: ({
      defaultOpen,
      children,
      ...rest
    }: {
      defaultOpen?: boolean;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => {
      capturedSidebarProviderProps.current = { defaultOpen };
      return (
        <div data-testid="sidebar-provider" {...rest}>
          {children}
        </div>
      );
    },
    SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});
vi.mock("./Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));
vi.mock("./AppSidebar", () => ({
  AppSidebar: () => <aside data-testid="app-sidebar">AppSidebar</aside>,
}));
vi.mock("./AIChatDock", () => ({
  AIChatDock: () => <div data-testid="ai-chat-dock">AIChatDock</div>,
}));

describe("AppLayout", () => {
  it("renders Header, AppSidebar, and AIChatDock", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-dock")).toBeInTheDocument();
    // 仕様 §2: サイドバーはデフォルトで閉じている。
    expect(capturedSidebarProviderProps.current.defaultOpen).toBe(false);
  });

  it("renders children in the main content area", () => {
    render(
      <AppLayout>
        <p>Main content</p>
      </AppLayout>,
    );
    expect(screen.getByText("Main content")).toBeInTheDocument();
  });

  it("sets layout CSS variables on the layout wrapper (--app-header-height, --ai-chat-width)", () => {
    const { container } = render(
      <AppLayout>
        <span>Content</span>
      </AppLayout>,
    );
    const wrapper =
      container.querySelector(".group\\/sidebar-wrapper") ?? container.firstElementChild;
    expect(wrapper).toBeInTheDocument();
    const style = wrapper?.getAttribute("style") ?? "";
    expect(style).toContain("--app-header-height");
    expect(style).toContain("4.5rem");
    expect(style).toContain("--ai-chat-width");
    expect(style).toContain("22rem");
  });
});
