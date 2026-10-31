import { Hono } from "hono";
import {
  enrollmentGate,
  finishVerification,
  hashAll,
  limitAttempts,
  readJsonObject,
  type SecondFactorContext,
  type SecondFactorEnv,
} from "./context";
import { passkeyRoutes } from "./passkeyRoutes";
import { generateRecoveryCodes, hashRecoveryCode } from "./recoveryCodes";
import { openSecret, sealSecret } from "./secretBox";
import { currentSession } from "./session";
import * as store from "./store";
import { generateTotpSecret, matchTotp, totpUri } from "./totp";

/** Issuer shown in authenticator apps. */
const ISSUER = "Zedi";

/** The `code` field of a JSON body, or "" when it is missing or not a string. */
async function readCode(c: SecondFactorContext): Promise<string> {
  const { code } = await readJsonObject(c);
  return typeof code === "string" ? code : "";
}

async function openTotpSecret(c: SecondFactorContext, sealed: string): Promise<string> {
  const secret = await openSecret(c.env.BETTER_AUTH_SECRET, sealed);
  if (secret === null) throw new Error("stored authenticator secret cannot be decrypted");
  return secret;
}

const invalidCode = (c: SecondFactorContext) => c.json({ error: "invalid_code" }, 400);

/**
 * `/api/second-factor/*`: register a passkey or an authenticator app, and pass the second step
 * with one of them or a recovery code. Open to sessions that have passed only Google; every
 * other API is not.
 * パスキーか認証アプリの登録と、それか復旧用コードでの 2 段階目。Google だけを通ったセッションでも使える。
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
    const [totp, passkeys, recoveryCodesRemaining] = await Promise.all([
      store.findTotp(c.env.DB, user.id),
      store.listPasskeys(c.env.DB, user.id),
      store.countRecoveryCodes(c.env.DB, user.id),
    ]);
    return c.json({
      verified: state === "verified",
      totp: totp?.confirmed ?? false,
      passkeys: passkeys.length,
      recoveryCodesRemaining,
    });
  });

  // One app per user, and never replaced with Google alone (see `enrollmentGate`). For a first
  // factor the recovery codes come now, before the first code, so a lost confirmation loses
  // nothing.
  routes.post("/totp/enrollment", async (c) => {
    const { user } = c.get("current");
    if ((await store.findTotp(c.env.DB, user.id))?.confirmed) {
      return c.json({ error: "already_enrolled" }, 409);
    }
    const gate = await enrollmentGate(c);
    if (gate instanceof Response) return gate;
    const secret = generateTotpSecret();
    const sealed = await sealSecret(c.env.BETTER_AUTH_SECRET, secret);
    const recoveryCodes = gate.firstFactor ? generateRecoveryCodes() : [];
    const hashes = await hashAll(recoveryCodes);
    if (!(await store.savePendingEnrollment(c.env.DB, user.id, sealed, hashes, Date.now()))) {
      return c.json({ error: "already_enrolled" }, 409);
    }
    const uri = totpUri({ secret, account: user.email, issuer: ISSUER });
    return c.json(gate.firstFactor ? { secret, uri, recoveryCodes } : { secret, uri });
  });

  routes.post("/totp/enrollment/confirm", async (c) => {
    const { user } = c.get("current");
    const totp = await store.findTotp(c.env.DB, user.id);
    if (totp?.confirmed) return c.json({ error: "already_enrolled" }, 409);
    if (!totp) return c.json({ error: "no_pending_enrollment" }, 409);
    const gate = await enrollmentGate(c);
    if (gate instanceof Response) return gate;
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

  routes.route("/passkey", passkeyRoutes());

  return routes;
}
