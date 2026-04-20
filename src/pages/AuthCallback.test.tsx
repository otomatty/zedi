/**
 * AuthCallback: redirects to returnTo when the target path is on the allowlist.
 * AuthCallback: returnTo が許可リスト上のパスのときのみリダイレクトする。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthCallback from "./AuthCallback";

const mockUseSession = vi.fn();

vi.mock("@/lib/auth/authClient", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

/**
 * Replace window.location with a spy-friendly stub for the duration of a test.
 * テスト中のみ window.location を spy 可能なスタブに差し替えるヘルパー。
 */
function stubLocation(search: string) {
  const originalLocation = window.location;
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, search, assign, href: `http://localhost/auth/callback${search}` },
  });
  return {
    assign,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    },
  };
}

describe("AuthCallback returnTo handling", () => {
  let loc: ReturnType<typeof stubLocation>;

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
  });

  afterEach(() => {
    loc?.restore();
    mockUseSession.mockReset();
  });

  it("redirects to /mcp/authorize (with preserved query) when returnTo points there", () => {
    const returnTo = "/mcp/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcb&state=xyz";
    loc = stubLocation(`?returnTo=${encodeURIComponent(returnTo)}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(loc.assign).toHaveBeenCalledWith(returnTo);
  });

  it("falls back to /home when returnTo is not on the allowlist", () => {
    loc = stubLocation(`?returnTo=${encodeURIComponent("/dangerous")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledWith("/home");
  });

  it("redirects to /invite-links/:token after social sign-in", () => {
    // The share-link flow stashes `/invite-links/<token>` in returnTo.
    // Regression for #672: this used to silently fall back to /home because
    // `/invite-links/*` wasn't on the allowlist.
    const token = "a".repeat(64);
    const returnTo = `/invite-links/${token}`;
    loc = stubLocation(`?returnTo=${encodeURIComponent(returnTo)}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledWith(returnTo);
  });

  it("rejects an /invite-links path with extra segments", () => {
    // Only single-segment tokens are allowlisted; nested paths must not leak.
    loc = stubLocation(`?returnTo=${encodeURIComponent("/invite-links/abc/evil")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledWith("/home");
  });

  it("rejects a bare /invite-links/ with no token", () => {
    loc = stubLocation(`?returnTo=${encodeURIComponent("/invite-links/")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledWith("/home");
  });
});
