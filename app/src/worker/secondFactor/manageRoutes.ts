import { Hono } from "hono";
import { hashAll, requireRecentSecondFactor, type SecondFactorEnv } from "./context";
import { generateRecoveryCodes } from "./recoveryCodes";
import { recentlyVerified } from "./state";
import * as store from "./store";

/**
 * The settings page's view of the second factor: list the methods, remove one (never the
 * last), and issue new recovery codes. Changes need a second step within the last five
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

  routes.post("/recovery-codes", async (c) => {
    const refused = await requireRecentSecondFactor(c);
    if (refused) return refused;
    const { user } = c.get("current");
    const recoveryCodes = generateRecoveryCodes();
    await store.replaceRecoveryCodes(c.env.DB, user.id, await hashAll(recoveryCodes), Date.now());
    return c.json({ recoveryCodes });
  });

  return routes;
}
