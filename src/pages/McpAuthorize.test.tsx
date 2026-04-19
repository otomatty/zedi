/**
 * McpAuthorize: when the consent API returns 401, send the user to /sign-in with a
 * safe returnTo pointing back to the current consent URL (path+query only, so that
 * SignIn's safety check accepts it).
 *
 * McpAuthorize: 認可 API が 401 を返したら、現在の同意画面の URL（パス+クエリのみ）
 * を returnTo として /sign-in に遷移させる。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpAuthorize from "./McpAuthorize";

function stubLocation(pathname: string, search: string) {
  const originalLocation = window.location;
  const hrefSetter = vi.fn();
  const mutable = {
    pathname,
    search,
    origin: "http://localhost",
    get href() {
      return `http://localhost${pathname}${search}`;
    },
    set href(value: string) {
      hrefSetter(value);
    },
    assign: vi.fn(),
    replace: vi.fn(),
  };
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: mutable,
  });
  return {
    hrefSetter,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    },
  };
}

describe("McpAuthorize sign-in redirect", () => {
  let loc: ReturnType<typeof stubLocation>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    loc?.restore();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("redirects to /sign-in?returnTo=<path+query> when the authorize-code API returns 401", async () => {
    const search =
      "?redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcb&code_challenge=abc&state=xyz&scopes=mcp%3Aread%2Cmcp%3Awrite";
    loc = stubLocation("/mcp/authorize", search);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    render(
      <MemoryRouter initialEntries={[`/mcp/authorize${search}`]}>
        <McpAuthorize />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(loc.hrefSetter).toHaveBeenCalledTimes(1));
    const target = loc.hrefSetter.mock.calls[0][0] as string;
    const expectedReturnTo = `/mcp/authorize${search}`;
    expect(target).toBe(`/sign-in?returnTo=${encodeURIComponent(expectedReturnTo)}`);
  });
});
