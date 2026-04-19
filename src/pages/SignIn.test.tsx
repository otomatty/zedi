/**
 * SignIn page: returnTo query param safely forwarded to Better Auth callback.
 * SignIn ページ: returnTo クエリを Better Auth コールバックに安全に引き継ぐ。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignIn from "./SignIn";

const signInSocial = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth", () => ({
  signIn: {
    social: (args: unknown) => signInSocial(args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SignIn />
    </MemoryRouter>,
  );
}

describe("SignIn returnTo forwarding", () => {
  beforeEach(() => {
    signInSocial.mockClear();
  });

  it("forwards a safe returnTo (e.g. /mcp/authorize with query) to the OAuth callbackURL", async () => {
    const returnTo =
      "/mcp/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcb&code_challenge=abc&state=xyz&scopes=mcp%3Aread%2Cmcp%3Awrite";
    renderAt(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);

    fireEvent.click(screen.getByText("auth.signIn.google"));

    await waitFor(() => expect(signInSocial).toHaveBeenCalledTimes(1));
    const arg = signInSocial.mock.calls[0][0] as { provider: string; callbackURL: string };
    expect(arg.provider).toBe("google");
    expect(arg.callbackURL).toBe(
      `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
    );
  });

  it("uses the bare callback URL when no returnTo is present", async () => {
    renderAt("/sign-in");

    fireEvent.click(screen.getByText("auth.signIn.github"));

    await waitFor(() => expect(signInSocial).toHaveBeenCalledTimes(1));
    const arg = signInSocial.mock.calls[0][0] as { provider: string; callbackURL: string };
    expect(arg.provider).toBe("github");
    expect(arg.callbackURL).toBe(`${window.location.origin}/auth/callback`);
  });

  it("drops an unsafe returnTo (protocol-relative) to prevent open redirect", async () => {
    renderAt(`/sign-in?returnTo=${encodeURIComponent("//evil.example/")}`);

    fireEvent.click(screen.getByText("auth.signIn.google"));

    await waitFor(() => expect(signInSocial).toHaveBeenCalledTimes(1));
    const arg = signInSocial.mock.calls[0][0] as { callbackURL: string };
    expect(arg.callbackURL).toBe(`${window.location.origin}/auth/callback`);
  });
});
