/**
 * Header: sidebar trigger on desktop only, sticky/backdrop, search & AI actions, right menu.
 * ヘッダー: デスクトップのみサイドバートリガー、sticky/backdrop、検索・AI・右メニュー。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "./index";
import { useAuth } from "@/hooks/useAuth";

const { mockUseIsMobile, signedInAuth, signedOutAuth } = vi.hoisted(() => {
  /** Matches `useAuth` return shape (Better Auth) for typed mocks. */
  const signedInAuth = {
    isLoaded: true,
    isSignedIn: true,
    userId: "test-user-id",
    sessionId: "test-session-id",
    orgId: null,
    orgRole: null,
    orgSlug: null,
    getToken: async () => null as string | null,
    signOut: async () => {},
  };
  const signedOutAuth = {
    ...signedInAuth,
    isSignedIn: false,
    userId: null,
    sessionId: null,
  };
  return { mockUseIsMobile: vi.fn(() => false), signedInAuth, signedOutAuth };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ ...signedInAuth })),
}));

vi.mock("@/contexts/GlobalSearchContext", () => ({
  useGlobalSearchContextOptional: () => null,
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="container">
      {children}
    </div>
  ),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useIsMobile: () => mockUseIsMobile(),
    SidebarTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
      <button type="button" aria-label={ariaLabel} data-testid="sidebar-trigger">
        Menu
      </button>
    ),
  };
});

vi.mock("./HeaderLogo", () => ({ HeaderLogo: () => <div data-testid="header-logo">Logo</div> }));
vi.mock("./MonthNavigation", () => ({
  MonthNavigation: () => <div data-testid="month-nav">Month</div>,
}));
vi.mock("./HeaderSearchBar", () => ({
  HeaderSearchBar: () => <div data-testid="header-search">Search</div>,
}));
vi.mock("./UnifiedMenu", () => ({ UnifiedMenu: () => <div data-testid="unified-menu">Menu</div> }));
vi.mock("./AIChatButton", () => ({
  AIChatButton: () => (
    <button type="button" data-testid="ai-chat-btn">
      AI
    </button>
  ),
}));

describe("Header", () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    vi.mocked(useAuth).mockReturnValue({ ...signedInAuth });
  });

  it("renders sidebar trigger with accessible label (nav.menu)", () => {
    render(<Header />);
    const trigger = screen.getByTestId("sidebar-trigger");
    expect(trigger).toHaveAttribute("aria-label", "Menu");
  });

  it("does not render sidebar trigger when useIsMobile is true", () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<Header />);
    expect(screen.queryByTestId("sidebar-trigger")).not.toBeInTheDocument();
  });

  it("has sticky and backdrop-blur layout classes", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header");
    expect(header?.className).toMatch(/sticky/);
    expect(header?.className).toMatch(/backdrop-blur/);
  });

  it("does not render search bar when search context is null", () => {
    render(<Header />);
    expect(screen.queryByTestId("header-search")).not.toBeInTheDocument();
  });

  it("renders unified menu", () => {
    render(<Header />);
    expect(screen.getByTestId("unified-menu")).toBeInTheDocument();
  });

  it("does not show guest sync prompt when signed in", () => {
    render(<Header />);
    expect(screen.queryByText("common.guestSyncPrompt")).not.toBeInTheDocument();
  });

  it("shows guest sync prompt when not signed in", () => {
    vi.mocked(useAuth).mockReturnValue({ ...signedOutAuth });
    render(<Header />);
    expect(screen.getByText("common.guestSyncPrompt")).toBeInTheDocument();
  });
});
