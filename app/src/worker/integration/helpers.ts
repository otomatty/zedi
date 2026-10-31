import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { TEST_IDP_PASSWORD } from "./testIdpPassword";

/** Origin used for every request in the workerd integration tests. */
export const BASE = "http://zedi.test";

let counter = 0;
/** A fresh test-IdP address per call so tests in the same file never share a user. */
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${(counter += 1)}@test.zedi-note.app`;

/** Applies a response's Set-Cookie headers to a cookie jar (empty values delete). */
function storeCookies(jar: Map<string, string>, res: Response) {
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value === "" || /max-age=0/i.test(header)) jar.delete(name);
    else jar.set(name, value);
  }
}

/**
 * Runs the OAuth flow against the test IdP up to its redirect back to the app (start → IdP
 * sign-in form). Returns the callback URL and the cookies the browser holds at that point.
 * テスト用 IdP の手順を、アプリへ戻る直前まで進める。戻り先の URL と、その時点の Cookie を返す。
 */
export async function startSignIn(
  email: string,
  origin = BASE,
): Promise<{ callbackUrl: string; jar: Map<string, string> }> {
  const jar = new Map<string, string>();
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

/** The Cookie header for a cookie jar. */
export const cookieHeader = (jar: Map<string, string>) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

/**
 * Signs in through the real OAuth flow against the test IdP (start → IdP sign-in form →
 * callback) and returns the Cookie header for subsequent requests.
 * テスト用 IdP に対して実際の OAuth の手順でサインインし、以降のリクエスト用の Cookie を返す。
 */
export async function signIn(email: string, origin = BASE): Promise<string> {
  const { callbackUrl, jar } = await startSignIn(email, origin);
  const callback = await SELF.fetch(callbackUrl, {
    headers: { cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  expect(callback.status).toBe(302);
  storeCookies(jar, callback);
  expect([...jar.keys()].some((name) => name.includes("session_token"))).toBe(true);
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
