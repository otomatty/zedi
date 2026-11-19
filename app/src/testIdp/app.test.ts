import { describe, expect, it } from "vitest";
import { createTestIdp, type TestIdpOptions } from "./app";

const ORIGIN = "https://pr-1.preview.zedi-note.app";
const REDIRECT = `${ORIGIN}/api/auth/callback/test-idp`;
const VERIFIER = "a-code-verifier-that-is-long-enough-for-pkce-0123456789";

async function s256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let clock = 1_000_000;
const options: TestIdpOptions = {
  secret: "test-idp-signing-secret-000000000000",
  password: "letmein",
  emailDomain: "test.zedi-note.app",
  clientId: "zedi-app",
  now: () => clock,
};
const idp = createTestIdp(options);

async function authorizeQuery(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: "zedi-app",
    redirect_uri: REDIRECT,
    state: "state-123",
    code_challenge: await s256(VERIFIER),
    code_challenge_method: "S256",
    scope: "openid email profile",
    ...overrides,
  }).toString();
}

function signInForm(query: string, email: string, password: string) {
  return idp.request(`${ORIGIN}/test-idp/authorize?${query}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });
}

async function issueCode(email = "alice@test.zedi-note.app"): Promise<string> {
  const res = await signInForm(await authorizeQuery(), email, "letmein");
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location") ?? "");
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
  expect(location.searchParams.get("state")).toBe("state-123");
  return location.searchParams.get("code") ?? "";
}

function exchange(code: string, overrides: Record<string, string> = {}) {
  return idp.request("https://test-idp/test-idp/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: "zedi-app",
      code_verifier: VERIFIER,
      ...overrides,
    }).toString(),
  });
}

describe("test IdP: authorize", () => {
  it("shows a sign-in form for a valid request", async () => {
    const res = await idp.request(`${ORIGIN}/test-idp/authorize?${await authorizeQuery()}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
  });

  it.each([
    ["an unknown client", { client_id: "someone-else" }],
    [
      "a redirect to another origin",
      { redirect_uri: "https://evil.example/api/auth/callback/test-idp" },
    ],
    ["a redirect to another path", { redirect_uri: `${ORIGIN}/somewhere-else` }],
    ["a redirect with its own query", { redirect_uri: `${REDIRECT}?next=/admin` }],
    ["a missing PKCE challenge", { code_challenge: "" }],
    ["a plain PKCE challenge", { code_challenge_method: "plain" }],
    ["a missing state", { state: "" }],
    ["another response type", { response_type: "token" }],
  ])("rejects %s", async (_label, overrides) => {
    const res = await idp.request(
      `${ORIGIN}/test-idp/authorize?${await authorizeQuery(overrides)}`,
    );
    expect(res.status).toBe(400);
  });

  it("refuses a wrong password and does not redirect", async () => {
    const res = await signInForm(await authorizeQuery(), "alice@test.zedi-note.app", "nope");
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("refuses an address outside the test domain", async () => {
    // 本物の利用者のアドレス（Gmail など）でアカウントを作らせない。
    // The test IdP must never mint an identity for a real user's address.
    const res = await signInForm(await authorizeQuery(), "alice@gmail.com", "letmein");
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("test IdP: token and userinfo", () => {
  it("exchanges a code for an access token that resolves to the signed-in user", async () => {
    const tokenRes = await exchange(await issueCode("Alice@Test.Zedi-Note.App"));
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { access_token: string; token_type: string };
    expect(token.token_type).toBe("Bearer");

    const userRes = await idp.request("https://test-idp/test-idp/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    expect(userRes.status).toBe(200);
    expect(await userRes.json()).toEqual({
      sub: "alice@test.zedi-note.app",
      email: "alice@test.zedi-note.app",
      email_verified: true,
      name: "alice",
    });
  });

  it("rejects a code with the wrong PKCE verifier", async () => {
    const res = await exchange(await issueCode(), { code_verifier: `${VERIFIER}-wrong` });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant" });
  });

  it("rejects a code sent with another redirect URI", async () => {
    const res = await exchange(await issueCode(), {
      redirect_uri: "https://pr-2.preview.zedi-note.app/api/auth/callback/test-idp",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const code = await issueCode();
    clock += 61_000;
    const res = await exchange(code);
    expect(res.status).toBe(400);
  });

  it("rejects a tampered code", async () => {
    const code = await issueCode();
    const res = await exchange(`${code.slice(0, -2)}xx`);
    expect(res.status).toBe(400);
  });

  it("does not accept an access token as a code, or a code as an access token", async () => {
    const code = await issueCode();
    const asBearer = await idp.request("https://test-idp/test-idp/userinfo", {
      headers: { authorization: `Bearer ${code}` },
    });
    expect(asBearer.status).toBe(401);

    const token = (await (await exchange(code)).json()) as { access_token: string };
    expect((await exchange(token.access_token)).status).toBe(400);
  });

  it("rejects userinfo without a token", async () => {
    const res = await idp.request("https://test-idp/test-idp/userinfo");
    expect(res.status).toBe(401);
  });

  it("rejects an expired access token", async () => {
    const token = (await (await exchange(await issueCode())).json()) as { access_token: string };
    clock += 301_000;
    const res = await idp.request("https://test-idp/test-idp/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    expect(res.status).toBe(401);
  });
});
