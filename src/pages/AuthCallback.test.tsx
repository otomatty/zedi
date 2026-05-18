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

  it("falls back to /notes/me when returnTo is not on the allowlist", () => {
    loc = stubLocation(`?returnTo=${encodeURIComponent("/dangerous")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledWith("/notes/me");
  });

  it("redirects to /invite-links/:token after social sign-in", () => {
    // The share-link flow stashes `/invite-links/<token>` in returnTo.
    // Regression for #672: this used to silently fall back to /home because
    // `/invite-links/*` wasn't on the allowlist.
    //
    // 共有リンクの受諾フローは returnTo に `/invite-links/<token>` を積む。
    // #672 より前はこのパスが許可リストに無く、社認後に /home へ落ちていた。
    const token = "a".repeat(64);
    const returnTo = `/invite-links/${token}`;
    loc = stubLocation(`?returnTo=${encodeURIComponent(returnTo)}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(loc.assign).toHaveBeenCalledWith(returnTo);
  });

  it("rejects an /invite-links path with extra segments", () => {
    // Only single-segment tokens are allowlisted; nested paths must not leak.
    // トークンは 1 セグメントのみ許可。ネストしたパスは通さない。
    loc = stubLocation(`?returnTo=${encodeURIComponent("/invite-links/abc/evil")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(loc.assign).toHaveBeenCalledWith("/notes/me");
  });

  it("rejects a bare /invite-links/ with no token", () => {
    loc = stubLocation(`?returnTo=${encodeURIComponent("/invite-links/")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(loc.assign).toHaveBeenCalledWith("/notes/me");
  });

  it("allows URL-encoded slashes inside the token and round-trips them safely", () => {
    // The URL parser keeps `%2F` encoded inside pathname, so it stays a single
    // segment and the allowlist accepts it. The implementation then re-encodes
    // the decoded rest, which preserves the original %2F form (no injection).
    //
    // URL パーサは `%2F` を pathname 内でエンコードされたまま保持するため、
    // 依然 1 セグメント扱いとなり許可リストを通る。実装は decode → encode で
    // 往復するので、元の `%2F` の形が保たれる（インジェクションは発生しない）。
    loc = stubLocation(`?returnTo=${encodeURIComponent("/invite-links/abc%2Fevil")}`);

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(loc.assign).toHaveBeenCalledWith("/invite-links/abc%2Fevil");
  });
});
