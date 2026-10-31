import { Hono, type Context } from "hono";
import { getAuth } from "../auth";
import type { Env } from "../env";
import { generateRecoveryCodes, hashRecoveryCode } from "./recoveryCodes";
import { openSecret, sealSecret } from "./secretBox";
import { currentSession, type CurrentSession } from "./session";
import * as store from "./store";
import { generateTotpSecret, matchTotp, totpUri } from "./totp";

type SecondFactorEnv = { Bindings: Env; Variables: { current: CurrentSession } };
type SecondFactorContext = Context<SecondFactorEnv>;

/** Issuer shown in authenticator apps. */
const ISSUER = "Zedi";

/** The `code` field of a JSON body, or "" when it is missing or not a string. */
async function readCode(c: SecondFactorContext): Promise<string> {
  const body: unknown = await c.req.json().catch(() => null);
  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : null;
  return typeof code === "string" ? code : "";
}

/** Counts the attempt; returns the 429 response when the user has run out of attempts. */
async function limitAttempts(c: SecondFactorContext): Promise<Response | null> {
  const reserved = await store.reserveAttempt(c.env.DB, c.get("current").user.id, Date.now());
  if (reserved.allowed) return null;
  c.header("retry-after", String(Math.ceil(reserved.retryAfterMs / 1000)));
  return c.json({ error: "too_many_attempts" }, 429);
}

async function openTotpSecret(c: SecondFactorContext, sealed: string): Promise<string> {
  const secret = await openSecret(c.env.BETTER_AUTH_SECRET, sealed);
  if (secret === null) throw new Error("stored authenticator secret cannot be decrypted");
  return secret;
}

const invalidCode = (c: SecondFactorContext) => c.json({ error: "invalid_code" }, 400);

/**
 * Marks the session verified and re-reads it from D1, so the session cookie cache (which the
 * gates read) carries the new state at once.
 * セッションを確認済みにし、D1 から読み直して Cookie キャッシュにもすぐ反映する。
 */
async function finishVerification(c: SecondFactorContext, body: Record<string, unknown>) {
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

/**
 * `/api/second-factor/*`: register an authenticator app, and pass the second step with it or a
 * recovery code. Open to sessions that have passed only Google; every other API is not.
 * 認証アプリの登録と、それか復旧用コードでの 2 段階目。Google だけを通ったセッションでも使える。
 */
export function secondFactorRoutes() {
  const routes = new Hono<SecondFactorEnv>();

  routes.use(async (c, next) => {
    const current = await currentSession(c.env, c.req.raw);
    if (!current || current.state === "expired") return c.json({ error: "unauthorized" }, 401);
    c.set("current", current);
    await next();
  });

  routes.get("/", async (c) => {
    const { user, state } = c.get("current");
    const [totp, recoveryCodesRemaining] = await Promise.all([
      store.findTotp(c.env.DB, user.id),
      store.countRecoveryCodes(c.env.DB, user.id),
    ]);
    return c.json({
      verified: state === "verified",
      totp: totp?.confirmed ?? false,
      recoveryCodesRemaining,
    });
  });

  // Only while the user has no app: Google alone must never be enough to replace one. The
  // recovery codes come now, before the first code, so a lost confirmation loses nothing.
  routes.post("/totp/enrollment", async (c) => {
    const { user } = c.get("current");
    const secret = generateTotpSecret();
    const sealed = await sealSecret(c.env.BETTER_AUTH_SECRET, secret);
    const recoveryCodes = generateRecoveryCodes();
    const hashes = (await Promise.all(recoveryCodes.map(hashRecoveryCode))) as string[];
    if (!(await store.savePendingEnrollment(c.env.DB, user.id, sealed, hashes, Date.now()))) {
      return c.json({ error: "already_enrolled" }, 409);
    }
    const uri = totpUri({ secret, account: user.email, issuer: ISSUER });
    return c.json({ secret, uri, recoveryCodes });
  });

  routes.post("/totp/enrollment/confirm", async (c) => {
    const { user } = c.get("current");
    const totp = await store.findTotp(c.env.DB, user.id);
    if (totp?.confirmed) return c.json({ error: "already_enrolled" }, 409);
    if (!totp) return c.json({ error: "no_pending_enrollment" }, 409);
    const limited = await limitAttempts(c);
    if (limited) return limited;
    const now = Date.now();
    const step = await matchTotp(
      await openTotpSecret(c, totp.sealedSecret),
      await readCode(c),
      now,
    );
    if (step === null) return invalidCode(c);
    if (!(await store.confirmTotp(c.env.DB, user.id, totp.sealedSecret, step, now))) {
      return c.json({ error: "no_pending_enrollment" }, 409);
    }
    return finishVerification(c, {});
  });

  routes.post("/totp/verify", async (c) => {
    const { user } = c.get("current");
    const totp = await store.findTotp(c.env.DB, user.id);
    if (!totp?.confirmed) return c.json({ error: "not_enrolled" }, 409);
    const limited = await limitAttempts(c);
    if (limited) return limited;
    const secret = await openTotpSecret(c, totp.sealedSecret);
    const step = await matchTotp(secret, await readCode(c), Date.now());
    if (step === null || !(await store.useTotpStep(c.env.DB, user.id, step))) {
      return invalidCode(c);
    }
    return finishVerification(c, {});
  });

  routes.post("/recovery-code/verify", async (c) => {
    const { user } = c.get("current");
    const limited = await limitAttempts(c);
    if (limited) return limited;
    const hash = await hashRecoveryCode(await readCode(c));
    if (!hash || !(await store.useRecoveryCode(c.env.DB, user.id, hash, Date.now()))) {
      return invalidCode(c);
    }
    const recoveryCodesRemaining = await store.countRecoveryCodes(c.env.DB, user.id);
    return finishVerification(c, { recoveryCodesRemaining });
  });

  return routes;
}
