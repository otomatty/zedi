import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { totpCode, totpStep } from "../secondFactor/totp";
import { TEST_IDP_PASSWORD } from "./testIdpPassword";

/** Origin used for every request in the workerd integration tests. */
export const BASE = "http://zedi.test";

let counter = 0;
/** A fresh test-IdP address per call so tests in the same file never share a user. */
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${(counter += 1)}@test.zedi-note.app`;

/** A browser's cookies, by name. */
export type CookieJar = Map<string, string>;

/** Applies a response's Set-Cookie headers to a cookie jar (empty values delete). */
export function storeCookies(jar: CookieJar, res: Response) {
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value === "" || /max-age=0/i.test(header)) jar.delete(name);
    else jar.set(name, value);
  }
}

/** The Cookie header for a cookie jar. */
export const cookieHeader = (jar: CookieJar) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

/**
 * Runs the OAuth flow against the test IdP up to its redirect back to the app (start → IdP
 * sign-in form). Returns the callback URL and the cookies the browser holds at that point.
 * テスト用 IdP の手順を、アプリへ戻る直前まで進める。戻り先の URL と、その時点の Cookie を返す。
 */
export async function startSignIn(
  email: string,
  origin = BASE,
): Promise<{ callbackUrl: string; jar: CookieJar }> {
  const jar: CookieJar = new Map();
  const start = await SELF.fetch(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ provider: "test-idp", callbackURL: "/notes" }),
  });
  expect(start.status).toBe(200);
  storeCookies(jar, start);
  const { url } = (await start.json()) as { url: string };
  expect(url.startsWith(`${origin}/test-idp/authorize?`)).toBe(true);

  const authorize = await SELF.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: TEST_IDP_PASSWORD }).toString(),
    redirect: "manual",
  });
  expect(authorize.status).toBe(302);
  return { callbackUrl: authorize.headers.get("location") ?? "", jar };
}

/**
 * The first step only: signs in through the test IdP and returns the cookies of a session
 * that has not passed the second factor yet.
 * 1 段階目だけを済ませ、2 段階目が未確認のセッションの Cookie を返す。
 */
export async function signInFirstFactor(email: string, origin = BASE): Promise<CookieJar> {
  const { callbackUrl, jar } = await startSignIn(email, origin);
  const callback = await SELF.fetch(callbackUrl, {
    headers: { cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  expect(callback.status).toBe(302);
  storeCookies(jar, callback);
  expect([...jar.keys()].some((name) => name.includes("session_token"))).toBe(true);
  return jar;
}

/** POSTs JSON to a second-factor endpoint with the jar's cookies, and keeps the cookies it sets. */
export async function postSecondFactor(
  path: string,
  jar: CookieJar,
  body: unknown = {},
  origin = BASE,
): Promise<Response> {
  const res = await SELF.fetch(`${origin}/api/second-factor${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: cookieHeader(jar) },
    body: JSON.stringify(body),
  });
  storeCookies(jar, res);
  return res;
}

/** The authenticator app and recovery codes the tests hold for each user they enrolled. */
const factors = new Map<string, { secret: string; recoveryCodes: string[]; lastStep: number }>();

/** The second factors `signIn` registered for `email`. */
export function enrolledFactors(email: string) {
  const enrolled = factors.get(email);
  if (!enrolled) throw new Error(`${email} has not been enrolled by signIn`);
  return enrolled;
}

/**
 * Passes the second step for a session: registers an authenticator app the first time, and
 * afterwards enters a code the user has not used yet (a recovery code once the app's codes
 * for the current time are spent).
 * 2 段階目を済ませる。初回は認証アプリを登録し、以後はまだ使っていないコードを入れる。
 */
export async function passSecondFactor(email: string, jar: CookieJar, origin = BASE) {
  const enrolled = factors.get(email);
  if (!enrolled) {
    const start = await postSecondFactor("/totp/enrollment", jar, {}, origin);
    expect(start.status).toBe(200);
    const { secret, recoveryCodes } = (await start.json()) as {
      secret: string;
      recoveryCodes: string[];
    };
    const step = totpStep(Date.now());
    const confirm = await postSecondFactor(
      "/totp/enrollment/confirm",
      jar,
      { code: await totpCode(secret, step) },
      origin,
    );
    expect(confirm.status).toBe(200);
    factors.set(email, { secret, recoveryCodes, lastStep: step });
    return;
  }
  const current = totpStep(Date.now());
  const step = Math.max(current, enrolled.lastStep + 1);
  if (step <= current + 1) {
    const res = await postSecondFactor(
      "/totp/verify",
      jar,
      { code: await totpCode(enrolled.secret, step) },
      origin,
    );
    expect(res.status).toBe(200);
    enrolled.lastStep = step;
    return;
  }
  const code = enrolled.recoveryCodes.shift();
  if (!code) throw new Error(`${email} has no recovery codes left`);
  expect((await postSecondFactor("/recovery-code/verify", jar, { code }, origin)).status).toBe(200);
}

/**
 * Signs in through the real OAuth flow against the test IdP and passes the second factor,
 * returning the Cookie header for subsequent requests.
 * テスト用 IdP でサインインし、2 段階目も済ませて、以降のリクエスト用の Cookie を返す。
 */
export async function signIn(email: string, origin = BASE): Promise<string> {
  const jar = await signInFirstFactor(email, origin);
  await passSecondFactor(email, jar, origin);
  return cookieHeader(jar);
}

/** JSON request helper that sends the session cookie and a same-origin Origin header. */
export function api(
  path: string,
  cookie: string | null,
  init: { method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { origin: BASE };
  if (cookie) headers.cookie = cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return SELF.fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Current user + default note for a session. */
export async function me(
  cookie: string,
): Promise<{ user: { id: string; email: string }; defaultNoteId: string }> {
  const res = await api("/api/me", cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string; email: string }; defaultNoteId: string };
}
