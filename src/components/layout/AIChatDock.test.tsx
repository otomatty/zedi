/**
 * AI chat dock: render when aiChatAvailable; desktop spacer + aside; mobile Drawer; spacer aria-hidden.
 * AI チャットドック: aiChatAvailable 時のみ描画、デスクトップはスペーサー＋aside、モバイルは Drawer、スペーサー aria-hidden。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIChatDock } from "./AIChatDock";

const mockUseAIChatStore = vi.hoisted(() => vi.fn(() => ({ isOpen: false, closePanel: vi.fn() })));
const mockUseAIChatContext = vi.hoisted(() => vi.fn(() => ({ aiChatAvailable: true })));
const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));
const capturedDrawerOnOpenChange = vi.hoisted(() => ({
  current: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("@/stores/aiChatStore", () => ({
  useAIChatStore: () => mockUseAIChatStore(),
}));
vi.mock("@/contexts/AIChatContext", () => ({
  useAIChatContext: () => mockUseAIChatContext(),
}));
vi.mock("@zedi/ui/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));
vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    Drawer: ({
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => {
      capturedDrawerOnOpenChange.current = onOpenChange;
      return <div data-testid="mock-drawer">{children}</div>;
    },
    DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});
vi.mock("@/components/ai-chat/AIChatPanel", () => ({
  AIChatPanel: () => <div data-testid="ai-chat-panel">AIChatPanel</div>,
}));

describe("AIChatDock", () => {
  it("renders nothing when aiChatAvailable is false", () => {
    mockUseAIChatContext.mockReturnValue({ aiChatAvailable: false });
    const { container } = render(<AIChatDock />);
    expect(container.firstChild).toBeNull();
    mockUseAIChatContext.mockReturnValue({ aiChatAvailable: true });
  });

  it("renders spacer and aside with layout CSS vars when desktop and aiChatAvailable", () => {
    mockUseAIChatContext.mockReturnValue({ aiChatAvailable: true });
    mockUseIsMobile.mockReturnValue(false);
    mockUseAIChatStore.mockReturnValue({ isOpen: false, closePanel: vi.fn() });

    const { container } = render(<AIChatDock />);
    const spacer = container.querySelector("[aria-hidden]");
    expect(spacer).toBeInTheDocument();
    expect(spacer?.getAttribute("style")).toContain("width: 0");

    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside?.className).toContain("top-[var(--app-header-height)]");
    expect(aside?.className).toContain("h-[calc(100svh-var(--app-header-height))]");
  });

  it("sets spacer width to var(--ai-chat-width) when open on desktop", () => {
    mockUseAIChatStore.mockReturnValue({ isOpen: true, closePanel: vi.fn() });
    const { container } = render(<AIChatDock />);
    const spacer = container.querySelector("[aria-hidden]");
    expect(spacer?.getAttribute("style")).toContain("var(--ai-chat-width)");
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("opacity-100");
  });

  it("renders aside with closed state classes when desktop and not open", () => {
    mockUseAIChatStore.mockReturnValue({ isOpen: false, closePanel: vi.fn() });
    const { container } = render(<AIChatDock />);
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("opacity-0");
  });

  it("renders Drawer with AIChatPanel when mobile (no desktop aside)", () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseAIChatContext.mockReturnValue({ aiChatAvailable: true });
    const { container } = render(<AIChatDock />);
    expect(screen.getByTestId("ai-chat-panel")).toBeInTheDocument();
    // Mobile branch returns Drawer only; desktop branch has aside. Assert we are in mobile branch.
    expect(container.querySelector("aside")).toBeNull();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("calls closePanel when Drawer onOpenChange(false) on mobile", () => {
    const closePanel = vi.fn();
    capturedDrawerOnOpenChange.current = undefined;
    mockUseIsMobile.mockReturnValue(true);
    mockUseAIChatStore.mockReturnValue({ isOpen: true, closePanel });
    mockUseAIChatContext.mockReturnValue({ aiChatAvailable: true });
    render(<AIChatDock />);
    expect(capturedDrawerOnOpenChange.current).toBeDefined();
    capturedDrawerOnOpenChange.current?.(false);
    expect(closePanel).toHaveBeenCalledTimes(1);
    mockUseIsMobile.mockReturnValue(false);
  });
});
