import { SELF } from "cloudflare:test";
import { expect } from "vitest";

/** Origin used for every request in the workerd integration tests. */
export const BASE = "http://zedi.test";

let counter = 0;
/** A fresh e-mail per call so tests in the same file never share a user. */
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${(counter += 1)}@example.com`;

/**
 * Signs in through the real magic-link flow (request → dev outbox → verify) and returns
 * the Cookie header for subsequent requests.
 * 実際のマジックリンク手順でサインインし、以降のリクエスト用の Cookie を返す。
 */
export async function signIn(email: string): Promise<string> {
  const request = await SELF.fetch(`${BASE}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, callbackURL: "/notes" }),
  });
  expect(request.status).toBe(200);
  const outbox = await SELF.fetch(`${BASE}/api/dev/outbox?email=${encodeURIComponent(email)}`);
  expect(outbox.status).toBe(200);
  const { url } = (await outbox.json()) as { url: string };
  const verify = await SELF.fetch(url, { redirect: "manual" });
  expect(verify.status).toBe(302);
  const cookies = verify.headers.getSetCookie().map((c: string) => c.split(";")[0]);
  expect(cookies.some((c: string | undefined) => c?.includes("session_token"))).toBe(true);
  return cookies.join("; ");
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
