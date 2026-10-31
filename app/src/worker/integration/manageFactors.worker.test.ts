import { SELF, env } from "cloudflare:test";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import * as store from "../secondFactor/store";
import { totpCode, totpStep } from "../secondFactor/totp";
import {
  BASE,
  cookieHeader,
  enrolledFactors,
  passSecondFactor,
  postSecondFactor,
  signInFirstFactor,
  storeCookies,
  uniqueEmail,
  type CookieJar,
} from "./helpers";
import { SoftAuthenticator } from "./softAuthenticator";

/** Sends a request to a second-factor endpoint with the jar's cookies. */
async function send(method: string, path: string, jar: CookieJar) {
  const res = await SELF.fetch(`${BASE}/api/second-factor${path}`, {
    method,
    headers: { origin: BASE, cookie: cookieHeader(jar) },
  });
  storeCookies(jar, res);
  return res;
}

interface Methods {
  passkeys: { id: string; name: string; createdAt: number; lastUsedAt: number | null }[];
  totp: boolean;
  recoveryCodesRemaining: number;
  recentlyVerified: boolean;
}

async function methods(jar: CookieJar): Promise<Methods> {
  const res = await send("GET", "/methods", jar);
  expect(res.status).toBe(200);
  return (await res.json()) as Methods;
}

/** A user who registered the authenticator app first; the session just passed the second step. */
async function appUser(label: string) {
  const email = uniqueEmail(label);
  const jar = await signInFirstFactor(email);
  await passSecondFactor(email, jar);
  return { email, jar };
}

/** Adds a software passkey to a session that may add one. */
async function addPasskey(jar: CookieJar): Promise<SoftAuthenticator> {
  const start = await postSecondFactor("/passkey/registration", jar);
  expect(start.status).toBe(200);
  const { options } = (await start.json()) as { options: PublicKeyCredentialCreationOptionsJSON };
  const passkey = await SoftAuthenticator.create();
  const res = await postSecondFactor("/passkey/registration/confirm", jar, {
    response: await passkey.register(options, BASE),
  });
  expect(res.status).toBe(200);
  return passkey;
}

/** A user whose only factor is a passkey; the session just registered it. */
async function passkeyUser(label: string) {
  const email = uniqueEmail(label);
  const jar = await signInFirstFactor(email);
  const passkey = await addPasskey(jar);
  return { email, jar, passkey };
}

/** Makes the session's last second step `minutes` old (the rule reads it from D1). */
async function ageSecondFactor(jar: CookieJar, minutes: number) {
  const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
  await env.DB.prepare("UPDATE session SET second_factor_at = ?1 WHERE token = ?2")
    .bind(Date.now() - minutes * 60_000, token)
    .run();
}

const userId = async (email: string) =>
  (await env.DB.prepare("SELECT id FROM user WHERE email = ?1").bind(email).first<{ id: string }>())
    ?.id ?? "";

describe("managing second factors: the list", () => {
  it("lists the user's passkeys, the app and the codes left, and whether the session may change them", async () => {
    const { jar } = await appUser("manage-list");
    const passkey = await addPasskey(jar);
    const listed = await methods(jar);
    expect(listed.totp).toBe(true);
    expect(listed.recoveryCodesRemaining).toBe(10);
    expect(listed.recentlyVerified).toBe(true);
    expect(listed.passkeys).toHaveLength(1);
    expect(listed.passkeys[0]).toMatchObject({
      id: passkey.id,
      name: "パスキー",
      lastUsedAt: null,
    });
    expect(listed.passkeys[0]?.createdAt).toBeGreaterThan(0);
  });

  it("says when the session's second step is more than five minutes old", async () => {
    const { jar } = await appUser("manage-stale");
    await ageSecondFactor(jar, 6);
    expect((await methods(jar)).recentlyVerified).toBe(false);
  });

  it("is not shown to a session that has passed only Google", async () => {
    const { email } = await appUser("manage-pending");
    const pending = await signInFirstFactor(email);
    const res = await send("GET", "/methods", pending);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "second_factor_required" });
  });
});

describe("managing second factors: removing a passkey", () => {
  it("removes a passkey when another method is left", async () => {
    const { jar } = await appUser("rm-passkey");
    const passkey = await addPasskey(jar);
    expect((await send("DELETE", `/passkeys/${passkey.id}`, jar)).status).toBe(204);
    expect((await methods(jar)).passkeys).toEqual([]);
  });

  it("refuses to remove the last method", async () => {
    const { jar, passkey } = await passkeyUser("rm-last-passkey");
    const res = await send("DELETE", `/passkeys/${passkey.id}`, jar);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_factor" });
    expect((await methods(jar)).passkeys).toHaveLength(1);
  });

  it("answers 404 for a passkey that is not the user's", async () => {
    const other = await passkeyUser("rm-other-owner");
    const { jar } = await appUser("rm-other");
    await addPasskey(jar);
    expect((await send("DELETE", `/passkeys/${other.passkey.id}`, jar)).status).toBe(404);
    expect((await methods(other.jar)).passkeys).toHaveLength(1);
  });

  it("needs a second step within the last five minutes", async () => {
    const { jar } = await appUser("rm-stale");
    const passkey = await addPasskey(jar);
    await ageSecondFactor(jar, 6);
    const res = await send("DELETE", `/passkeys/${passkey.id}`, jar);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "reverification_required" });
  });

  it("refuses a session that has passed only Google", async () => {
    const { email, jar } = await appUser("rm-google");
    const passkey = await addPasskey(jar);
    const pending = await signInFirstFactor(email);
    const res = await send("DELETE", `/passkeys/${passkey.id}`, pending);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "second_factor_required" });
  });
});

describe("managing second factors: removing the app", () => {
  it("removes the app when a passkey is left, and lets the user register a new one", async () => {
    const { jar } = await appUser("rm-app");
    await addPasskey(jar);
    expect((await send("DELETE", "/totp", jar)).status).toBe(204);
    expect((await methods(jar)).totp).toBe(false);
    expect((await postSecondFactor("/totp/verify", jar, { code: "123456" })).status).toBe(409);

    // A new phone: register the app again (still within five minutes), without new codes.
    const start = await postSecondFactor("/totp/enrollment", jar);
    const body = (await start.json()) as { secret: string; recoveryCodes?: string[] };
    expect(body.recoveryCodes).toBeUndefined();
    const confirm = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await totpCode(body.secret, totpStep(Date.now())),
    });
    expect(confirm.status).toBe(200);
    expect(await methods(jar)).toMatchObject({ totp: true, recoveryCodesRemaining: 10 });
  });

  it("refuses to remove the app when it is the last method", async () => {
    const { jar } = await appUser("rm-last-app");
    const res = await send("DELETE", "/totp", jar);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_factor" });
  });

  it("answers 409 when there is no app to remove", async () => {
    const { jar } = await passkeyUser("rm-no-app");
    const res = await send("DELETE", "/totp", jar);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enrolled" });
  });

  it("needs a second step within the last five minutes", async () => {
    const { jar } = await appUser("rm-app-stale");
    await addPasskey(jar);
    await ageSecondFactor(jar, 6);
    expect((await send("DELETE", "/totp", jar)).status).toBe(403);
  });

  it("never leaves a user without a method, even when both are removed at once", async () => {
    // 2 つの削除が同時に来ても、条件は削除の文そのものにあるので、どちらか一方しか通らない。
    // The condition lives in each delete statement, so two removals racing cannot both pass.
    const { email, jar } = await appUser("rm-race");
    const passkey = await addPasskey(jar);
    const id = await userId(email);
    const results = await Promise.all([
      store.deletePasskey(env.DB, id, passkey.id),
      store.deleteTotp(env.DB, id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.hasFactor(env.DB, id)).toBe(true);
  });
});

describe("managing second factors: new recovery codes", () => {
  it("replaces every recovery code with ten new ones, shown once", async () => {
    const { email, jar } = await appUser("new-codes");
    const old = enrolledFactors(email).recoveryCodes;
    const res = await send("POST", "/recovery-codes", jar);
    expect(res.status).toBe(200);
    const { recoveryCodes } = (await res.json()) as { recoveryCodes: string[] };
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes).not.toContain(old[0]);
    expect((await methods(jar)).recoveryCodesRemaining).toBe(10);

    const next = await signInFirstFactor(email);
    expect((await postSecondFactor("/recovery-code/verify", next, { code: old[0] })).status).toBe(
      400,
    );
    expect(
      (await postSecondFactor("/recovery-code/verify", next, { code: recoveryCodes[0] })).status,
    ).toBe(200);
  });

  it("needs a second step within the last five minutes", async () => {
    const { jar } = await appUser("new-codes-stale");
    await ageSecondFactor(jar, 6);
    const res = await send("POST", "/recovery-codes", jar);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "reverification_required" });
  });
});

describe("managing second factors: checking again", () => {
  it("lets an older session pass the second step again, after which changes are allowed", async () => {
    const { email, jar } = await appUser("again");
    await addPasskey(jar);
    await ageSecondFactor(jar, 6);
    expect((await send("POST", "/recovery-codes", jar)).status).toBe(403);

    const { secret, lastStep } = enrolledFactors(email);
    const verify = await postSecondFactor("/totp/verify", jar, {
      code: await totpCode(secret, lastStep + 1),
    });
    expect(verify.status).toBe(200);
    expect((await methods(jar)).recentlyVerified).toBe(true);
    expect((await send("POST", "/recovery-codes", jar)).status).toBe(200);
  });
});
