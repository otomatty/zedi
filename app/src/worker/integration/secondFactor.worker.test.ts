import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getAuth } from "../auth";
import { totpCode, totpStep } from "../secondFactor/totp";
import {
  BASE,
  api,
  cookieHeader,
  enrolledFactors,
  me,
  passSecondFactor,
  postSecondFactor,
  signIn,
  signInFirstFactor,
  storeCookies,
  uniqueEmail,
  type CookieJar,
} from "./helpers";

const status = async (jar: CookieJar) => {
  const res = await SELF.fetch(`${BASE}/api/second-factor`, {
    headers: { cookie: cookieHeader(jar) },
  });
  return { code: res.status, body: res.ok ? await res.json() : null };
};

/** Starts enrollment and returns the authenticator app's secret and the recovery codes. */
async function enroll(jar: CookieJar): Promise<{ secret: string; recoveryCodes: string[] }> {
  const res = await postSecondFactor("/totp/enrollment", jar);
  expect(res.status).toBe(200);
  return (await res.json()) as { secret: string; recoveryCodes: string[] };
}

/** Starts enrollment and returns the authenticator app's secret. */
const startEnrollment = async (jar: CookieJar) => (await enroll(jar)).secret;

const nowCode = (secret: string) => totpCode(secret, totpStep(Date.now()));

describe("second factor: the gate", () => {
  it("keeps a session that passed only Google out of the API", async () => {
    const jar = await signInFirstFactor(uniqueEmail("gate"));
    for (const path of ["/api/me", "/api/search?q=abc"]) {
      const res = await api(path, cookieHeader(jar));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "second_factor_required" });
    }
  });

  it("keeps such a session out of Better Auth's account endpoints, but lets it sign out", async () => {
    const jar = await signInFirstFactor(uniqueEmail("gate-auth"));
    const listSessions = await api("/api/auth/list-sessions", cookieHeader(jar));
    expect(listSessions.status).toBe(403);
    expect(await listSessions.json()).toEqual({ error: "second_factor_required" });
    expect((await api("/api/auth/get-session", cookieHeader(jar))).status).toBe(200);
    const signOut = await api("/api/auth/sign-out", cookieHeader(jar), {
      method: "POST",
      body: {},
    });
    expect(signOut.status).toBe(200);
  });

  it("lets a verified session use Better Auth's account endpoints", async () => {
    const cookie = await signIn(uniqueEmail("gate-auth-ok"));
    expect((await api("/api/auth/list-sessions", cookie)).status).toBe(200);
  });

  it("keeps such a session out of the collaborative editing WebSocket", async () => {
    const owner = await signIn(uniqueEmail("gate-ws-owner"));
    const { defaultNoteId } = await me(owner);
    const created = await api(`/api/notes/${defaultNoteId}/pages`, owner, {
      method: "POST",
      body: { title: "ws" },
    });
    const { id } = (await created.json()) as { id: string };
    const ownerEmail = (await me(owner)).user.email;
    const pending = await signInFirstFactor(ownerEmail);
    const res = await SELF.fetch(`${BASE}/parties/page-room/${id}`, {
      headers: { upgrade: "websocket", origin: BASE, cookie: cookieHeader(pending) },
    });
    expect(res.status).toBe(403);
  });

  it("reports no session to Better Auth's get-session once the ten minutes are up", async () => {
    const jar = await signInFirstFactor(uniqueEmail("stale-get"));
    const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
    await env.DB.prepare("UPDATE session SET created_at = ?1 WHERE token = ?2")
      .bind(Date.now() - 10 * 60_000, token)
      .run();
    // A cookie cache refreshed from D1 now carries the old creation time and stays valid for
    // minutes; Better Auth alone would keep answering from it.
    const { headers } = await getAuth(env, BASE).api.getSession({
      headers: new Headers({ cookie: cookieHeader(jar) }),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    storeCookies(jar, new Response(null, { headers }));
    expect([...jar.keys()].some((name) => name.includes("session_data"))).toBe(true);

    const res = await api("/api/auth/get-session", cookieHeader(jar));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM session WHERE token = ?1")
      .bind(token)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("lets a user whose unverified session ran out sign in again", async () => {
    const email = uniqueEmail("stale-again");
    const jar = await signInFirstFactor(email);
    const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
    await env.DB.prepare("UPDATE session SET created_at = ?1 WHERE token = ?2")
      .bind(Date.now() - 10 * 60_000, token)
      .run();
    const res = await SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie: cookieHeader(jar) },
      body: JSON.stringify({ provider: "test-idp", callbackURL: "/notes" }),
    });
    expect(res.status).toBe(200);
  });

  it("ends an unverified session ten minutes after Google sign-in", async () => {
    const jar = await signInFirstFactor(uniqueEmail("stale"));
    const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
    await env.DB.prepare("UPDATE session SET created_at = ?1 WHERE token = ?2")
      .bind(Date.now() - 10 * 60_000, token)
      .run();
    // Drop the cookie cache so the session is read from D1 again, as it is every five minutes.
    const tokenOnly = `better-auth.session_token=${jar.get("better-auth.session_token")}`;

    expect((await api("/api/me", tokenOnly)).status).toBe(401);
    expect((await api("/api/second-factor", tokenOnly)).status).toBe(401);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM session WHERE token = ?1")
      .bind(token)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("answers 401 to the second-factor endpoints without a session", async () => {
    expect((await SELF.fetch(`${BASE}/api/second-factor`)).status).toBe(401);
    expect((await postSecondFactor("/totp/enrollment", new Map())).status).toBe(401);
  });
});

describe("second factor: registering an authenticator app", () => {
  it("reports that a new user has no second factor yet", async () => {
    const jar = await signInFirstFactor(uniqueEmail("new"));
    expect(await status(jar)).toEqual({
      code: 200,
      body: { verified: false, totp: false, recoveryCodesRemaining: 0 },
    });
  });

  it("hands out a secret and the otpauth URI for the user's account", async () => {
    const email = uniqueEmail("uri");
    const jar = await signInFirstFactor(email);
    const res = await postSecondFactor("/totp/enrollment", jar);
    const { secret, uri } = (await res.json()) as { secret: string; uri: string };
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const parsed = new URL(uri);
    expect(decodeURIComponent(parsed.pathname)).toBe(`/Zedi:${email}`);
    expect(parsed.searchParams.get("secret")).toBe(secret);
  });

  it("hands out the ten recovery codes with the secret, before the first code", async () => {
    // 確定の応答が途中で失われても、利用者はすでに復旧用コードを持っている。
    // If the confirmation's response is lost, the user already holds the recovery codes.
    const jar = await signInFirstFactor(uniqueEmail("codes-first"));
    const { recoveryCodes } = await enroll(jar);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
  });

  it("does not accept the recovery codes before the app is confirmed", async () => {
    const jar = await signInFirstFactor(uniqueEmail("codes-pending"));
    const { recoveryCodes } = await enroll(jar);
    const res = await postSecondFactor("/recovery-code/verify", jar, { code: recoveryCodes[0] });
    expect(res.status).toBe(400);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(403);
  });

  it("keeps the recovery codes usable when the confirmation's response never arrived", async () => {
    const email = uniqueEmail("lost-response");
    const jar = await signInFirstFactor(email);
    const { secret, recoveryCodes } = await enroll(jar);
    // The confirmation succeeds on the server, but the browser never sees the answer.
    await postSecondFactor("/totp/enrollment/confirm", jar, { code: await nowCode(secret) });

    const next = await signInFirstFactor(email);
    const res = await postSecondFactor("/recovery-code/verify", next, { code: recoveryCodes[0] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recoveryCodesRemaining: 9 });
  });

  it("does not finish with a wrong code", async () => {
    const jar = await signInFirstFactor(uniqueEmail("wrong"));
    const secret = await startEnrollment(jar);
    const wrong = String((Number(await nowCode(secret)) + 1) % 1_000_000).padStart(6, "0");
    const res = await postSecondFactor("/totp/enrollment/confirm", jar, { code: wrong });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_code" });
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(403);
  });

  it("finishes with the app's code: the session is verified", async () => {
    const jar = await signInFirstFactor(uniqueEmail("enroll"));
    const secret = await startEnrollment(jar);
    const res = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await nowCode(secret),
    });
    expect(res.status).toBe(200);

    expect((await api("/api/me", cookieHeader(jar))).status).toBe(200);
    expect(await status(jar)).toEqual({
      code: 200,
      body: { verified: true, totp: true, recoveryCodesRemaining: 10 },
    });
  });

  it("stores the app's secret encrypted and the recovery codes only as hashes", async () => {
    const email = uniqueEmail("at-rest");
    await signIn(email);
    const { secret, recoveryCodes } = enrolledFactors(email);
    const rows = await env.DB.prepare(
      `SELECT t.secret AS sealed, r.code_hash AS hash FROM totp_factors t
       JOIN user u ON u.id = t.user_id JOIN recovery_codes r ON r.user_id = u.id WHERE u.email = ?1`,
    )
      .bind(email)
      .all<{ sealed: string; hash: string }>();
    expect(rows.results).toHaveLength(10);
    for (const row of rows.results) {
      expect(row.sealed).not.toContain(secret);
      for (const code of recoveryCodes) {
        expect(row.hash).not.toContain(code.replace(/-/g, ""));
      }
    }
  });

  it("refuses to register another app once one is set up, so Google alone cannot replace it", async () => {
    const email = uniqueEmail("takeover");
    await signIn(email);
    const attacker = await signInFirstFactor(email);
    const res = await postSecondFactor("/totp/enrollment", attacker);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_enrolled" });
    // The user's own recovery codes and app still work.
    const [code] = enrolledFactors(email).recoveryCodes;
    expect((await postSecondFactor("/recovery-code/verify", attacker, { code })).status).toBe(200);
    const again = await signInFirstFactor(email);
    await passSecondFactor(email, again);
    expect((await api("/api/me", cookieHeader(again))).status).toBe(200);
  });

  it("uses the latest secret and codes when enrollment is started again before it is confirmed", async () => {
    const email = uniqueEmail("restart");
    const jar = await signInFirstFactor(email);
    const first = await enroll(jar);
    const second = await enroll(jar);
    expect(second.secret).not.toBe(first.secret);
    const stale = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await nowCode(first.secret),
    });
    expect(stale.status).toBe(400);
    const fresh = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await nowCode(second.secret),
    });
    expect(fresh.status).toBe(200);

    const next = await signInFirstFactor(email);
    const old = { code: first.recoveryCodes[0] };
    expect((await postSecondFactor("/recovery-code/verify", next, old)).status).toBe(400);
    const current = { code: second.recoveryCodes[0] };
    expect((await postSecondFactor("/recovery-code/verify", next, current)).status).toBe(200);
  });

  it("refuses to confirm without a pending enrollment", async () => {
    const jar = await signInFirstFactor(uniqueEmail("no-pending"));
    const res = await postSecondFactor("/totp/enrollment/confirm", jar, { code: "123456" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_pending_enrollment" });
  });
});

describe("second factor: signing in again", () => {
  it("verifies a new session with the app's code", async () => {
    const email = uniqueEmail("again");
    await signIn(email);
    const jar = await signInFirstFactor(email);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(403);
    const { secret, lastStep } = enrolledFactors(email);
    const res = await postSecondFactor("/totp/verify", jar, {
      code: await totpCode(secret, lastStep + 1),
    });
    expect(res.status).toBe(200);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(200);
  });

  it("refuses an app code that was already used", async () => {
    const email = uniqueEmail("replay-code");
    await signIn(email);
    const { secret, lastStep } = enrolledFactors(email);
    const jar = await signInFirstFactor(email);
    // The code that finished enrollment is still inside the time window, but it was used.
    const res = await postSecondFactor("/totp/verify", jar, {
      code: await totpCode(secret, lastStep),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_code" });
  });

  it("verifies with a recovery code once, and counts what is left", async () => {
    const email = uniqueEmail("recovery");
    await signIn(email);
    const [code] = enrolledFactors(email).recoveryCodes;
    const first = await signInFirstFactor(email);
    const used = await postSecondFactor("/recovery-code/verify", first, {
      code: code?.toLowerCase(),
    });
    expect(used.status).toBe(200);
    expect(await used.json()).toEqual({ recoveryCodesRemaining: 9 });
    expect((await api("/api/me", cookieHeader(first))).status).toBe(200);

    const second = await signInFirstFactor(email);
    const again = await postSecondFactor("/recovery-code/verify", second, { code });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: "invalid_code" });
  });

  it("refuses an app code before an app is registered", async () => {
    const jar = await signInFirstFactor(uniqueEmail("not-enrolled"));
    const res = await postSecondFactor("/totp/verify", jar, { code: "123456" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enrolled" });
  });

  it("stops accepting codes after five failed attempts, even a correct one", async () => {
    const email = uniqueEmail("throttle");
    await signIn(email);
    const jar = await signInFirstFactor(email);
    for (let i = 0; i < 5; i++) {
      const res = await postSecondFactor("/recovery-code/verify", jar, {
        code: "0000-0000-0000-0000",
      });
      expect(res.status).toBe(400);
    }
    const { secret, lastStep } = enrolledFactors(email);
    const blocked = await postSecondFactor("/totp/verify", jar, {
      code: await totpCode(secret, lastStep + 1),
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too_many_attempts" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // The limit is per user, so another session does not get fresh attempts.
    const other = await signInFirstFactor(email);
    const [code] = enrolledFactors(email).recoveryCodes;
    expect((await postSecondFactor("/recovery-code/verify", other, { code })).status).toBe(429);
  });

  it("allows attempts again once the fifteen-minute window has passed", async () => {
    const email = uniqueEmail("window");
    await signIn(email);
    const jar = await signInFirstFactor(email);
    const wrong = { code: "0000-0000-0000-0000" };
    for (let i = 0; i < 5; i++) await postSecondFactor("/recovery-code/verify", jar, wrong);
    expect((await postSecondFactor("/recovery-code/verify", jar, wrong)).status).toBe(429);
    await env.DB.prepare(
      `UPDATE second_factor_attempts SET window_started_at = ?1
       WHERE user_id = (SELECT id FROM user WHERE email = ?2)`,
    )
      .bind(Date.now() - 15 * 60_000, email)
      .run();
    const [code] = enrolledFactors(email).recoveryCodes;
    expect((await postSecondFactor("/recovery-code/verify", jar, { code })).status).toBe(200);
  });

  it("starts counting again after a successful second step", async () => {
    const email = uniqueEmail("reset");
    await signIn(email);
    const [first, second] = enrolledFactors(email).recoveryCodes;
    const wrong = { code: "0000-0000-0000-0000" };
    const jar = await signInFirstFactor(email);
    for (let i = 0; i < 4; i++) await postSecondFactor("/recovery-code/verify", jar, wrong);
    expect((await postSecondFactor("/recovery-code/verify", jar, { code: first })).status).toBe(
      200,
    );
    const next = await signInFirstFactor(email);
    expect((await postSecondFactor("/recovery-code/verify", next, wrong)).status).toBe(400);
    expect((await postSecondFactor("/recovery-code/verify", next, { code: second })).status).toBe(
      200,
    );
  });
});
