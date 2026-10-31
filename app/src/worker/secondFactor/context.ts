import type { Context } from "hono";
import { getAuth } from "../auth";
import type { Env } from "../env";
import { hashRecoveryCode } from "./recoveryCodes";
import type { CurrentSession } from "./session";
import { recentlyVerified } from "./state";
import * as store from "./store";

/** Hono environment of the second-factor routes: the request's session is resolved first. */
export type SecondFactorEnv = { Bindings: Env; Variables: { current: CurrentSession } };
/** Request context of the second-factor routes. */
export type SecondFactorContext = Context<SecondFactorEnv>;

/**
 * Parses a JSON body as an object; anything else reads as `{}`, so validation answers 400.
 * JSON 本文をオブジェクトとして読む。それ以外は `{}` にする。
 */
export async function readJsonObject(c: SecondFactorContext): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/** Hashes recovery codes for storage (generated codes always parse). */
export const hashAll = async (codes: string[]) =>
  (await Promise.all(codes.map(hashRecoveryCode))) as string[];

/** Counts the attempt; returns the 429 response when the user has run out of attempts. */
export async function limitAttempts(c: SecondFactorContext): Promise<Response | null> {
  const reserved = await store.reserveAttempt(c.env.DB, c.get("current").user.id, Date.now());
  if (reserved.allowed) return null;
  c.header("retry-after", String(Math.ceil(reserved.retryAfterMs / 1000)));
  return c.json({ error: "too_many_attempts" }, 429);
}

/**
 * Sensitive changes (removing a method, new recovery codes) need a session that passed the
 * second step within the last five minutes, read from D1 rather than the cookie cache. Returns
 * the refusal, or null when the change may go ahead.
 * 大事な変更には、5 分以内に 2 段階目を通ったセッションが要る（D1 から読む）。拒否の応答か null を返す。
 */
export async function requireRecentSecondFactor(c: SecondFactorContext): Promise<Response | null> {
  const { state, sessionId } = c.get("current");
  if (state !== "verified") return c.json({ error: "second_factor_required" }, 403);
  const at = await store.secondFactorAt(c.env.DB, sessionId);
  if (!recentlyVerified(at, Date.now())) return c.json({ error: "reverification_required" }, 403);
  return null;
}

/**
 * Who may register a second-factor method: anyone signed in with Google while the user has
 * none (the first one, which also issues the recovery codes), and otherwise only a session
 * that passed the second step within the last five minutes, read from D1. Google alone gets
 * 409 `already_enrolled`; an older verified session 403 `reverification_required`.
 * 確認方法を登録できるのは、まだ 1 つもないとき（最初の 1 つ）か、5 分以内に 2 段階目を通ったセッションだけ。
 */
export async function enrollmentGate(
  c: SecondFactorContext,
): Promise<{ firstFactor: boolean } | Response> {
  const { user, sessionId, state } = c.get("current");
  if (!(await store.hasFactor(c.env.DB, user.id))) return { firstFactor: true };
  if (state !== "verified") return c.json({ error: "already_enrolled" }, 409);
  const at = await store.secondFactorAt(c.env.DB, sessionId);
  if (!recentlyVerified(at, Date.now())) return c.json({ error: "reverification_required" }, 403);
  return { firstFactor: false };
}

/**
 * Marks the session verified and re-reads it from D1, so the session cookie cache (which the
 * gates read) carries the new state at once.
 * セッションを確認済みにし、D1 から読み直して Cookie キャッシュにもすぐ反映する。
 */
export async function finishVerification(c: SecondFactorContext, body: Record<string, unknown>) {
  const { sessionId, user } = c.get("current");
  await store.clearAttempts(c.env.DB, user.id);
  if (!(await store.markSessionVerified(c.env.DB, sessionId, Date.now()))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const { headers } = await getAuth(c.env, c.req.url).api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
  return c.json(body);
}
