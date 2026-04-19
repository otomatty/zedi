/**
 * BottomNav: 4 tabs (Home / Notes / AI / Me), aria-current on active tab,
 * safe-area padding, and Me tab opens a Sheet with the account menu content.
 *
 * ボトムナビ: 4 タブ（Home / Notes / AI / Me）、アクティブタブの aria-current、
 * safe-area padding、Me タブの Sheet 表示を検証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./index";

const { signedInAuth } = vi.hoisted(() => {
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
  return { signedInAuth };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ ...signedInAuth })),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  useUser: () => ({ user: null }),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ displayName: "", avatarUrl: "" }),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useSyncStatus: () => "idle",
  useSync: () => ({ sync: () => {}, isSyncing: false }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders four tabs: Home, Notes, AI, Me", () => {
    renderAt("/home");
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^ai$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
  });

  it("marks the Home tab as aria-current when on /home", () => {
    renderAt("/home");
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("aria-current", "page");
    const notesLink = screen.getByRole("link", { name: /notes/i });
    expect(notesLink).not.toHaveAttribute("aria-current", "page");
  });

  it("marks the Notes tab as aria-current when on /notes", () => {
    renderAt("/notes");
    const notesLink = screen.getByRole("link", { name: /notes/i });
    expect(notesLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the AI tab as aria-current when on /ai", () => {
    renderAt("/ai");
    const aiLink = screen.getByRole("link", { name: /^ai$/i });
    expect(aiLink).toHaveAttribute("aria-current", "page");
  });

  it("fixes the nav at the bottom with safe-area padding", () => {
    const { container } = renderAt("/home");
    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
    expect(nav?.className).toMatch(/fixed/);
    expect(nav?.className).toMatch(/bottom-0/);
    expect(nav?.className).toMatch(/safe-area-inset-bottom/);
  });

  it("opens the Me sheet when the Me tab is clicked", async () => {
    renderAt("/home");
    const meButton = screen.getByRole("button", { name: /account/i });
    fireEvent.click(meButton);
    expect(await screen.findByTestId("bottom-nav-me-content")).toBeInTheDocument();
  });
});
