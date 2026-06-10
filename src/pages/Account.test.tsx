/**
 * Account page: renders the shared account menu content (signed-in or
 * signed-out variant) inside a real route so the bottom-nav Account tab
 * can navigate to `/account` instead of opening a Sheet.
 *
 * アカウントページ: ボトムナビの「アカウント」タブが Sheet ではなく
 * `/account` への遷移として動くようにするため、共有のアカウントメニュー
 * （SignedIn / SignedOut バリアント）をページ内で描画することを検証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Account from "./Account";

const { authState } = vi.hoisted(() => {
  const authState: { isSignedIn: boolean } = { isSignedIn: true };
  return { authState };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "nav.account": "Account",
        "nav.settings": "Settings",
        "nav.plan": "Plan",
        "nav.signIn": "Sign In",
        "nav.signOut": "Sign Out",
        "common.syncIdleLabel": "Idle",
        "common.syncIdleDescription": "Idle",
      };
      return table[key] ?? fallback ?? key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/auth/useAuth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: authState.isSignedIn,
    signOut: async () => {},
  }),
  useUser: () => ({ user: null }),
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    authState.isSignedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    authState.isSignedIn ? null : <>{children}</>,
}));

vi.mock("@/hooks/auth/useProfile", () => ({
  useProfile: () => ({ displayName: "Alice", avatarUrl: "" }),
}));

vi.mock("@/hooks/pages/usePageQueries", () => ({
  useSyncStatus: () => "idle",
  useSync: () => ({ sync: () => {}, isSyncing: false }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <Account />
    </MemoryRouter>,
  );
}

describe("Account page", () => {
  beforeEach(() => {
    authState.isSignedIn = true;
  });

  it("renders the account page title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /account/i })).toBeInTheDocument();
  });

  it("renders the shared account menu content container", () => {
    renderPage();
    expect(screen.getByTestId("account-page-content")).toBeInTheDocument();
  });

  it("shows signed-in actions (Settings, Plan, Sign Out) when authenticated", () => {
    authState.isSignedIn = true;
    renderPage();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /plan/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows a Sign In CTA when signed out", () => {
    authState.isSignedIn = false;
    renderPage();
    const signIn = screen.getByRole("link", { name: /sign in/i });
    expect(signIn).toHaveAttribute("href", "/sign-in");
  });
});
