import { Hono } from "hono";
import {
  hashAll,
  readJsonObject,
  requireRecentSecondFactor,
  type SecondFactorEnv,
} from "./context";
import { generateRecoveryCodes } from "./recoveryCodes";
import { openOffer, sealOffer } from "./recoveryOffer";
import { recentlyVerified } from "./state";
import * as store from "./store";

/**
 * The settings page's view of the second factor: list the methods, remove one (never the
 * last), and switch to new recovery codes. Changes need a second step within the last five
 * minutes; the user can pass it again from the page (the verify endpoints renew it).
 * 確認方法の一覧・削除（最後の 1 つは消せない）・復旧用コードの作り直し。変更には 5 分以内の 2 段階目が要る。
 */
export function manageRoutes() {
  const routes = new Hono<SecondFactorEnv>();

  routes.get("/methods", async (c) => {
    const { user, state, sessionId } = c.get("current");
    if (state !== "verified") return c.json({ error: "second_factor_required" }, 403);
    const [passkeys, totp, recoveryCodesRemaining, at] = await Promise.all([
      store.describePasskeys(c.env.DB, user.id),
      store.findTotp(c.env.DB, user.id),
      store.countRecoveryCodes(c.env.DB, user.id),
      store.secondFactorAt(c.env.DB, sessionId),
    ]);
    return c.json({
      passkeys,
      totp: totp?.confirmed ?? false,
      recoveryCodesRemaining,
      recentlyVerified: recentlyVerified(at, Date.now()),
    });
  });

  routes.delete("/passkeys/:id", async (c) => {
    const refused = await requireRecentSecondFactor(c);
    if (refused) return refused;
    const { user } = c.get("current");
    const id = c.req.param("id");
    const owned = (await store.listPasskeys(c.env.DB, user.id)).some((p) => p.id === id);
    if (!owned) return c.json({ error: "not_found" }, 404);
    if (!(await store.deletePasskey(c.env.DB, user.id, id))) {
      return c.json({ error: "last_factor" }, 409);
    }
    return c.body(null, 204);
  });

  routes.delete("/totp", async (c) => {
    const refused = await requireRecentSecondFactor(c);
    if (refused) return refused;
    const { user } = c.get("current");
    if (!(await store.findTotp(c.env.DB, user.id))?.confirmed) {
      return c.json({ error: "not_enrolled" }, 409);
    }
    if (!(await store.deleteTotp(c.env.DB, user.id))) {
      return c.json({ error: "last_factor" }, 409);
    }
    return c.body(null, 204);
  });

  // New recovery codes come in two steps, so a lost answer at either one loses no codes: the
  // offer changes nothing, and confirming it again after the switch changes nothing either.
  routes.post("/recovery-codes", async (c) => {
    const refused = await requireRecentSecondFactor(c);
    if (refused) return refused;
    const { user, sessionId } = c.get("current");
    const recoveryCodes = generateRecoveryCodes();
    const offer = await sealOffer(c.env.BETTER_AUTH_SECRET, {
      userId: user.id,
      sessionId,
      batch: crypto.randomUUID(),
      hashes: await hashAll(recoveryCodes),
      now: Date.now(),
    });
    return c.json({ recoveryCodes, offer });
  });

  // The offer itself shows the step was recent when it was made; it lasts ten minutes so the
  // user has time to save the codes.
  routes.post("/recovery-codes/confirm", async (c) => {
    const { user, state, sessionId } = c.get("current");
    if (state !== "verified") return c.json({ error: "second_factor_required" }, 403);
    const { offer: sealed } = await readJsonObject(c);
    const now = Date.now();
    const offer =
      typeof sealed === "string"
        ? await openOffer(c.env.BETTER_AUTH_SECRET, sealed, { userId: user.id, sessionId, now })
        : null;
    if (!offer) return c.json({ error: "invalid_offer" }, 400);
    await store.replaceRecoveryCodes(c.env.DB, user.id, offer.hashes, offer.batch, now);
    return c.body(null, 204);
  });

  return routes;
}
