/**
 * BottomNav: 4 tabs (My Note / Notes / AI / Account), aria-current on the
 * active tab, safe-area padding, and the Account tab navigates to
 * `/account` as a real link (no Sheet).
 *
 * ボトムナビ: 4 タブ（マイノート / ノート / AI / アカウント）、アクティブタブの
 * aria-current、safe-area padding、アカウントタブが `/account` への通常リンクと
 * してレンダリングされること（Sheet を開かない）を検証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "nav.myNote": "My Note",
        "nav.notes": "Notes",
        "nav.ai": "AI",
        "nav.account": "Account",
        "nav.primary": "Primary navigation",
      };
      return table[key] ?? fallback ?? key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/auth/useAuth", () => ({
  useAuth: vi.fn(() => ({ ...signedInAuth })),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  useUser: () => ({ user: null }),
}));

vi.mock("@/hooks/auth/useProfile", () => ({
  useProfile: () => ({ displayName: "", avatarUrl: "" }),
}));

vi.mock("@/hooks/pages/usePageQueries", () => ({
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

  it("renders four tabs: My Note, Notes, AI, Account", () => {
    renderAt("/notes/me");
    expect(screen.getByRole("link", { name: /my note/i })).toBeInTheDocument();
    // 「Notes」と「My Note」が両方含まれるため、`/^notes$/i` で完全一致させる。
    // Use exact match for "Notes" since "My Note" also contains "Note".
    expect(screen.getByRole("link", { name: /^notes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^ai$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /account/i })).toBeInTheDocument();
  });

  it("marks the My Note tab as aria-current when on /notes/me", () => {
    renderAt("/notes/me");
    const myNoteLink = screen.getByRole("link", { name: /my note/i });
    expect(myNoteLink).toHaveAttribute("aria-current", "page");
    const notesLink = screen.getByRole("link", { name: /^notes$/i });
    expect(notesLink).not.toHaveAttribute("aria-current", "page");
  });

  it("marks the Notes tab as aria-current when on /notes", () => {
    renderAt("/notes");
    const notesLink = screen.getByRole("link", { name: /^notes$/i });
    expect(notesLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the AI tab as aria-current when on /ai", () => {
    renderAt("/ai");
    const aiLink = screen.getByRole("link", { name: /^ai$/i });
    expect(aiLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the AI tab as aria-current on /ai/:conversationId and /ai/history", () => {
    const detail = renderAt("/ai/conv-123");
    expect(screen.getByRole("link", { name: /^ai$/i })).toHaveAttribute("aria-current", "page");
    detail.unmount();

    renderAt("/ai/history");
    expect(screen.getByRole("link", { name: /^ai$/i })).toHaveAttribute("aria-current", "page");
  });

  it("fixes the nav at the bottom with safe-area padding", () => {
    const { container } = renderAt("/notes/me");
    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
    // 個別のクラストークンで判定する。`className.match(/.../)` だと Tailwind
    // が他の場所に同名サブストリングを含めたときに偽陽性／偽陰性になる。
    // Assert per-class token via classList so substring matches in unrelated
    // classes (or order changes) don't produce false positives or negatives.
    expect(nav?.classList.contains("fixed")).toBe(true);
    expect(nav?.classList.contains("bottom-0")).toBe(true);
    expect(nav?.classList.contains("pb-[env(safe-area-inset-bottom)]")).toBe(true);
    expect(nav?.getAttribute("style") ?? "").toContain("env(safe-area-inset-bottom)");
  });

  it("renders the Account tab as a link to /account (no Sheet)", () => {
    renderAt("/notes/me");
    const accountLink = screen.getByRole("link", { name: /account/i });
    expect(accountLink).toHaveAttribute("href", "/account");
    // 旧実装ではボタンクリックで Sheet を開いていた。Sheet を撤去したので
    // 自身が dialog を開くトリガーではないことを確認する。
    // The old implementation opened a Sheet on click. Now the tab is a
    // plain link; verify it does not advertise itself as a dialog trigger.
    expect(accountLink).not.toHaveAttribute("aria-haspopup", "dialog");
    expect(accountLink).not.toHaveAttribute("aria-expanded");
  });

  it("marks the Account tab as aria-current when on /account", () => {
    renderAt("/account");
    const accountLink = screen.getByRole("link", { name: /account/i });
    expect(accountLink).toHaveAttribute("aria-current", "page");
  });
});
