/**
 * Header: primary functional nav, sticky/backdrop layout, search action, user-only menu.
 * ヘッダー: 機能ナビゲーション、sticky/backdrop、検索、ユーザー専用メニュー。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "./index";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@zedi/ui";

const { signedInAuth, signedOutAuth } = vi.hoisted(() => {
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
  return { signedInAuth, signedOutAuth };
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

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
  };
});

vi.mock("../MobileHeader", () => ({
  MobileHeader: () => <header data-testid="mobile-header">MobileHeader</header>,
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="container">
      {children}
    </div>
  ),
}));

vi.mock("./HeaderLogo", () => ({ HeaderLogo: () => <div data-testid="header-logo">Logo</div> }));
vi.mock("./HeaderSearchBar", () => ({
  HeaderSearchBar: () => <div data-testid="header-search">Search</div>,
}));
vi.mock("./NavigationMenu", () => ({
  NavigationMenu: () => <div data-testid="navigation-menu">NavigationMenu</div>,
}));
vi.mock("./UnifiedMenu", () => ({ UnifiedMenu: () => <div data-testid="unified-menu">Menu</div> }));

describe("Header", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ ...signedInAuth });
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("renders the navigation menu", () => {
    render(<Header />);
    expect(screen.getByTestId("navigation-menu")).toBeInTheDocument();
  });

  it("does not render the legacy sidebar trigger", () => {
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

  it("delegates to MobileHeader on mobile viewports", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<Header />);
    expect(screen.getByTestId("mobile-header")).toBeInTheDocument();
    expect(screen.queryByTestId("navigation-menu")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unified-menu")).not.toBeInTheDocument();
  });
});
