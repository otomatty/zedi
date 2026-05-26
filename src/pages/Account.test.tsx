/**
 * Account hub page: reuses signed-in / signed-out menu content.
 *
 * アカウントハブページ: サインイン済み・未サインインのメニュー内容を再利用する。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Account from "./Account";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "nav.account": "Account",
        "nav.settings": "Settings",
        "nav.plan": "Plan",
        "nav.signOut": "Sign out",
      };
      return table[key] ?? fallback ?? key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    signOut: vi.fn(),
  }),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  useUser: () => ({
    user: {
      fullName: "Test User",
      firstName: "Test",
      primaryEmailAddress: { emailAddress: "test@example.com" },
    },
  }),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ displayName: "Test User", avatarUrl: "" }),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useSyncStatus: () => "idle",
  useSync: () => ({ sync: vi.fn(), isSyncing: false }),
}));

describe("Account page", () => {
  it("renders the account title and menu content", () => {
    render(
      <MemoryRouter>
        <Account />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /account/i })).toBeInTheDocument();
    expect(screen.getByTestId("account-page-content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });
});
