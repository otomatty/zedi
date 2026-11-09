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

  it.each(["?code_challenge=abc", "?redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcb", ""])(
    "shows missing parameter errors without sending a request: %s",
    (search) => {
      render(
        <MemoryRouter initialEntries={[`/mcp/authorize${search}`]}>
          <McpAuthorize />
        </MemoryRouter>,
      );

      expect(screen.getByText("redirect_uri and code_challenge are required")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("shows the authorization API error and permits another approval attempt", async () => {
    const search =
      "?redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcb&code_challenge=abc&state=xyz&scopes=mcp%3Aread";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Authorization denied" }), { status: 403 }),
    );
    render(
      <MemoryRouter initialEntries={[`/mcp/authorize${search}`]}>
        <McpAuthorize />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Authorization denied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/mcp/authorize-code"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          redirect_uri: "http://127.0.0.1:9876/cb",
          code_challenge: "abc",
          state: "xyz",
          scopes: ["mcp:read"],
        }),
      }),
    );
  });
});
