import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { BASE, api, cookieHeader, me, signIn, startSignIn, uniqueEmail } from "./helpers";

describe("auth (Better Auth on D1)", () => {
  it("rejects API calls without a session", async () => {
    expect((await api("/api/me", null)).status).toBe(401);
  });

  it("signs in through the test IdP and provisions a default note for a new user", async () => {
    const email = uniqueEmail("alice");
    const cookie = await signIn(email);
    const profile = await me(cookie);
    expect(profile.user.email).toBe(email);
    expect(profile.defaultNoteId).toMatch(/.+/);
  });

  it("reuses the same user and default note on a second sign-in", async () => {
    const email = uniqueEmail("repeat");
    const first = await me(await signIn(email));
    const second = await me(await signIn(email));
    expect(second.user.id).toBe(first.user.id);
    expect(second.defaultNoteId).toBe(first.defaultNoteId);
  });

  // テスト用 IdP は認可コードを期限まで再交換できる。使い回しを止めているのは、ブラウザの state Cookie と、
  // 1 回目のコールバックで消えるアプリ側の state。
  // The test IdP lets a code be exchanged again until it expires; what stops a replay is the app's
  // OAuth state, which needs the browser's state cookie and is deleted on the first callback.
  const sessionCookieSet = (res: Response) =>
    res.headers.getSetCookie().some((c) => c.split("=")[0]?.includes("session_token"));

  it("rejects a sign-in callback that arrives without the browser's state cookie", async () => {
    const { callbackUrl } = await startSignIn(uniqueEmail("stolen"));
    const res = await SELF.fetch(callbackUrl, { redirect: "manual" });
    expect(res.headers.get("location")).toBe(`${BASE}/api/auth/error?error=state_mismatch`);
    expect(sessionCookieSet(res)).toBe(false);
  });

  it("accepts each sign-in callback only once", async () => {
    const { callbackUrl, jar } = await startSignIn(uniqueEmail("replay"));
    const cookie = cookieHeader(jar);
    const first = await SELF.fetch(callbackUrl, { headers: { cookie }, redirect: "manual" });
    expect(first.headers.get("location")).toBe("/notes");
    expect(sessionCookieSet(first)).toBe(true);

    const replay = await SELF.fetch(callbackUrl, { headers: { cookie }, redirect: "manual" });
    expect(replay.headers.get("location")).toBe(`${BASE}/api/auth/error?error=state_mismatch`);
    expect(sessionCookieSet(replay)).toBe(false);
  });

  it("invalidates the session on sign-out", async () => {
    const cookie = await signIn(uniqueEmail("bye"));
    const res = await api("/api/auth/sign-out", cookie, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const cleared = res.headers
      .getSetCookie()
      .map((c: string) => c.split(";")[0])
      .join("; ");
    expect((await api("/api/me", cleared)).status).toBe(401);
  });
});

describe("sign-in options", () => {
  it("tells the sign-in page which providers it can offer, without a session", async () => {
    // テストには Google の資格情報がないので、Google は出さずテスト用 IdP だけを出す。
    // The tests have no Google credentials, so only the test IdP is offered.
    const res = await api("/api/sign-in-options", null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ google: false, testIdp: true });
  });

  it("no longer offers magic links or the dev outbox", async () => {
    const magicLink = await api("/api/auth/sign-in/magic-link", null, {
      method: "POST",
      body: { email: uniqueEmail("link"), callbackURL: "/notes" },
    });
    expect(magicLink.status).toBe(404);
    // /api/* はまずセッションを確かめるので、サインインした状態で入口が消えたことを確かめる。
    // /api/* checks the session first, so check with one that the outbox route is gone.
    const cookie = await signIn(uniqueEmail("outbox"));
    expect((await api("/api/dev/outbox?email=x@test.zedi-note.app", cookie)).status).toBe(404);
  });

  it("exposes only the test IdP's sign-in page, not its token or userinfo endpoints", async () => {
    expect((await SELF.fetch(`${BASE}/test-idp/userinfo`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/test-idp/token`, { method: "POST" })).status).toBe(404);
  });
});

describe("without the TEST_IDP binding (production)", () => {
  // 本番には TEST_IDP がない。そのとき、テスト用 IdP のどの入口も開かないこと。
  // Production has no TEST_IDP binding; none of the test IdP's entry points may open then.
  const origin = "http://no-test-idp.test";
  const { TEST_IDP: _omitted, ...productionLike } = env;
  const fetchApp = (path: string, init?: RequestInit) =>
    createApp().fetch(new Request(`${origin}${path}`, init), productionLike);

  it("does not offer the test IdP", async () => {
    const res = await fetchApp("/api/sign-in-options");
    expect(await res.json()).toEqual({ google: false, testIdp: false });
  });

  it("does not serve the test IdP's sign-in page", async () => {
    expect((await fetchApp("/test-idp/authorize?client_id=zedi-app")).status).toBe(404);
  });

  it("refuses to start a sign-in with the test IdP", async () => {
    const res = await fetchApp("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ provider: "test-idp", callbackURL: "/notes" }),
    });
    expect(res.status).toBe(404);
  });
});
