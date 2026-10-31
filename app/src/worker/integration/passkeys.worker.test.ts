import { SELF, env } from "cloudflare:test";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import { totpCode, totpStep } from "../secondFactor/totp";
import {
  BASE,
  api,
  cookieHeader,
  enrolledFactors,
  passSecondFactor,
  postSecondFactor,
  signInFirstFactor,
  uniqueEmail,
  type CookieJar,
} from "./helpers";
import { SoftAuthenticator } from "./softAuthenticator";

const RP_ID = new URL(BASE).hostname;

async function status(jar: CookieJar) {
  const res = await SELF.fetch(`${BASE}/api/second-factor`, {
    headers: { cookie: cookieHeader(jar) },
  });
  return (await res.json()) as Record<string, unknown>;
}

async function registrationOptions(jar: CookieJar) {
  const res = await postSecondFactor("/passkey/registration", jar);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    options: PublicKeyCredentialCreationOptionsJSON;
    recoveryCodes?: string[];
  };
}

/** Registers a new software passkey for the session and returns it. */
async function registerPasskey(jar: CookieJar): Promise<SoftAuthenticator> {
  const { options } = await registrationOptions(jar);
  const passkey = await SoftAuthenticator.create();
  const res = await postSecondFactor("/passkey/registration/confirm", jar, {
    response: await passkey.register(options, BASE),
  });
  expect(res.status).toBe(200);
  return passkey;
}

async function authenticationOptions(jar: CookieJar) {
  const res = await postSecondFactor("/passkey/authentication", jar);
  expect(res.status).toBe(200);
  return ((await res.json()) as { options: PublicKeyCredentialRequestOptionsJSON }).options;
}

async function verifyWith(passkey: SoftAuthenticator, jar: CookieJar, origin = BASE) {
  const options = await authenticationOptions(jar);
  return postSecondFactor("/passkey/authentication/verify", jar, {
    response: await passkey.authenticate(options, origin),
  });
}

/** A user whose only second factor is a passkey: the session, the passkey and its codes. */
async function passkeyUser(label: string) {
  const email = uniqueEmail(label);
  const jar = await signInFirstFactor(email);
  const { options, recoveryCodes } = await registrationOptions(jar);
  const passkey = await SoftAuthenticator.create();
  const res = await postSecondFactor("/passkey/registration/confirm", jar, {
    response: await passkey.register(options, BASE),
  });
  expect(res.status).toBe(200);
  return { email, jar, passkey, recoveryCodes };
}

/** Makes the session's last second step `minutes` old (read from D1 by the freshness rule). */
async function ageSecondFactor(jar: CookieJar, minutes: number) {
  const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
  await env.DB.prepare("UPDATE session SET second_factor_at = ?1 WHERE token = ?2")
    .bind(Date.now() - minutes * 60_000, token)
    .run();
}

describe("passkeys: registering the first one", () => {
  it("hands out registration options for the user's account, with the recovery codes", async () => {
    const email = uniqueEmail("pk-options");
    const jar = await signInFirstFactor(email);
    const { options, recoveryCodes } = await registrationOptions(jar);
    expect(options.rp).toEqual({ id: RP_ID, name: "Zedi" });
    expect(options.user.name).toBe(email);
    expect(options.challenge.length).toBeGreaterThanOrEqual(32);
    expect(options.excludeCredentials).toEqual([]);
    expect(recoveryCodes).toHaveLength(10);
  });

  it("registers a passkey and verifies the session", async () => {
    const jar = await signInFirstFactor(uniqueEmail("pk-register"));
    await registerPasskey(jar);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(200);
    expect(await status(jar)).toEqual({
      verified: true,
      totp: false,
      passkeys: 1,
      recoveryCodesRemaining: 10,
    });
  });

  it("accepts its recovery codes only once the passkey is registered", async () => {
    const email = uniqueEmail("pk-codes");
    const jar = await signInFirstFactor(email);
    const { options, recoveryCodes } = await registrationOptions(jar);
    const early = await postSecondFactor("/recovery-code/verify", jar, {
      code: recoveryCodes?.[0],
    });
    expect(early.status).toBe(400);

    const passkey = await SoftAuthenticator.create();
    const confirm = await postSecondFactor("/passkey/registration/confirm", jar, {
      response: await passkey.register(options, BASE),
    });
    expect(confirm.status).toBe(200);
    const next = await signInFirstFactor(email);
    const res = await postSecondFactor("/recovery-code/verify", next, { code: recoveryCodes?.[1] });
    expect(res.status).toBe(200);
  });

  it("rejects a registration answered for another challenge or origin", async () => {
    const jar = await signInFirstFactor(uniqueEmail("pk-bad-reg"));
    const { options } = await registrationOptions(jar);
    const passkey = await SoftAuthenticator.create();
    const otherChallenge = { ...options, challenge: "b3RoZXItY2hhbGxlbmdlLW5vdC1pc3N1ZWQ" };
    const wrongChallenge = await postSecondFactor("/passkey/registration/confirm", jar, {
      response: await passkey.register(otherChallenge, BASE),
    });
    expect(wrongChallenge.status).toBe(400);
    expect(await wrongChallenge.json()).toEqual({ error: "invalid_passkey" });

    const again = await registrationOptions(jar);
    const wrongOrigin = await postSecondFactor("/passkey/registration/confirm", jar, {
      response: await passkey.register(again.options, "https://evil.example"),
    });
    expect(wrongOrigin.status).toBe(400);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(403);
  });

  it("refuses to confirm without a pending registration", async () => {
    const jar = await signInFirstFactor(uniqueEmail("pk-no-pending"));
    const passkey = await SoftAuthenticator.create();
    const options = {
      challenge: "bm90LWlzc3VlZC1ieS10aGUtc2VydmVyLWF0LWFsbA",
      rp: { id: RP_ID, name: "Zedi" },
    } as PublicKeyCredentialCreationOptionsJSON;
    const res = await postSecondFactor("/passkey/registration/confirm", jar, {
      response: await passkey.register(options, BASE),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_pending_registration" });
  });

  it("uses each registration challenge once", async () => {
    const jar = await signInFirstFactor(uniqueEmail("pk-reg-once"));
    const { options } = await registrationOptions(jar);
    const passkey = await SoftAuthenticator.create();
    const response = await passkey.register(options, BASE);
    expect(
      (await postSecondFactor("/passkey/registration/confirm", jar, { response })).status,
    ).toBe(200);
    const replay = await postSecondFactor("/passkey/registration/confirm", jar, { response });
    expect(replay.status).toBe(409);
    expect((await status(jar)).passkeys).toBe(1);
  });
});

describe("passkeys: signing in again", () => {
  it("verifies a new session with the passkey", async () => {
    const { email, passkey } = await passkeyUser("pk-again");
    const jar = await signInFirstFactor(email);
    const options = await authenticationOptions(jar);
    expect(options.rpId).toBe(RP_ID);
    expect(options.allowCredentials?.map((c) => c.id)).toEqual([passkey.id]);
    const res = await postSecondFactor("/passkey/authentication/verify", jar, {
      response: await passkey.authenticate(options, BASE),
    });
    expect(res.status).toBe(200);
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(200);
  });

  it("refuses an authenticator that was never registered", async () => {
    const { email } = await passkeyUser("pk-stranger");
    const jar = await signInFirstFactor(email);
    const res = await verifyWith(await SoftAuthenticator.create(), jar);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_passkey" });
    expect((await api("/api/me", cookieHeader(jar))).status).toBe(403);
  });

  it("refuses another user's passkey", async () => {
    const alice = await passkeyUser("pk-alice");
    const bob = await passkeyUser("pk-bob");
    const jar = await signInFirstFactor(alice.email);
    expect((await verifyWith(bob.passkey, jar)).status).toBe(400);
  });

  it("refuses an assertion made for another origin", async () => {
    const { email, passkey } = await passkeyUser("pk-origin");
    const jar = await signInFirstFactor(email);
    expect((await verifyWith(passkey, jar, "https://evil.example")).status).toBe(400);
  });

  it("uses each sign-in challenge once", async () => {
    const { email, passkey } = await passkeyUser("pk-replay");
    const jar = await signInFirstFactor(email);
    const options = await authenticationOptions(jar);
    const response = await passkey.authenticate(options, BASE);
    expect(
      (await postSecondFactor("/passkey/authentication/verify", jar, { response })).status,
    ).toBe(200);
    const again = await postSecondFactor("/passkey/authentication/verify", jar, { response });
    expect(again.status).toBe(400);
    const other = await signInFirstFactor(email);
    const replay = await postSecondFactor("/passkey/authentication/verify", other, { response });
    expect(replay.status).toBe(400);
  });

  it("refuses an answer to a challenge older than five minutes", async () => {
    const { email, passkey } = await passkeyUser("pk-expired");
    const jar = await signInFirstFactor(email);
    const options = await authenticationOptions(jar);
    const token = decodeURIComponent(jar.get("better-auth.session_token") ?? "").split(".")[0];
    await env.DB.prepare(
      `UPDATE webauthn_challenges SET expires_at = ?1
       WHERE session_id = (SELECT id FROM session WHERE token = ?2)`,
    )
      .bind(Date.now() - 1, token)
      .run();
    const res = await postSecondFactor("/passkey/authentication/verify", jar, {
      response: await passkey.authenticate(options, BASE),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a signature counter that went backwards (a cloned authenticator)", async () => {
    const { email, passkey } = await passkeyUser("pk-counter");
    passkey.counter = 5;
    expect((await verifyWith(passkey, await signInFirstFactor(email))).status).toBe(200);
    passkey.counter = 3;
    expect((await verifyWith(passkey, await signInFirstFactor(email))).status).toBe(400);
  });

  it("counts failed passkey attempts toward the limit", async () => {
    const { email, passkey } = await passkeyUser("pk-throttle");
    const jar = await signInFirstFactor(email);
    const stranger = await SoftAuthenticator.create();
    for (let i = 0; i < 5; i++) expect((await verifyWith(stranger, jar)).status).toBe(400);
    const blocked = await verifyWith(passkey, jar);
    expect(blocked.status).toBe(429);
  });

  it("refuses passkey sign-in before a passkey is registered", async () => {
    const jar = await signInFirstFactor(uniqueEmail("pk-none"));
    const res = await postSecondFactor("/passkey/authentication", jar);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enrolled" });
  });
});

describe("passkeys: adding the other method", () => {
  it("lets a session that just passed the second step add an authenticator app, without new recovery codes", async () => {
    const { jar, recoveryCodes, email } = await passkeyUser("pk-add-totp");
    const start = await postSecondFactor("/totp/enrollment", jar);
    expect(start.status).toBe(200);
    const body = (await start.json()) as { secret: string; recoveryCodes?: string[] };
    expect(body.recoveryCodes).toBeUndefined();
    const confirm = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await totpCode(body.secret, totpStep(Date.now())),
    });
    expect(confirm.status).toBe(200);
    expect(await status(jar)).toMatchObject({
      totp: true,
      passkeys: 1,
      recoveryCodesRemaining: 10,
    });
    const next = await signInFirstFactor(email);
    const res = await postSecondFactor("/recovery-code/verify", next, { code: recoveryCodes?.[0] });
    expect(res.status).toBe(200);
  });

  it("lets a session that just passed the second step add a passkey to an authenticator app", async () => {
    const email = uniqueEmail("pk-add-passkey");
    const jar = await signInFirstFactor(email);
    await passSecondFactor(email, jar);
    const { options, recoveryCodes } = await registrationOptions(jar);
    expect(recoveryCodes).toBeUndefined();
    const passkey = await SoftAuthenticator.create();
    const res = await postSecondFactor("/passkey/registration/confirm", jar, {
      response: await passkey.register(options, BASE),
    });
    expect(res.status).toBe(200);
    expect(await status(jar)).toMatchObject({
      totp: true,
      passkeys: 1,
      recoveryCodesRemaining: 10,
    });
    expect(enrolledFactors(email).recoveryCodes).toHaveLength(10);
  });

  it("lists the user's passkeys as excluded when adding another", async () => {
    const { jar, passkey } = await passkeyUser("pk-exclude");
    const { options } = await registrationOptions(jar);
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([passkey.id]);
  });

  it("refuses to add a method from a session whose second step is more than five minutes old", async () => {
    const { jar } = await passkeyUser("pk-stale");
    await ageSecondFactor(jar, 6);
    for (const path of ["/passkey/registration", "/totp/enrollment"]) {
      const res = await postSecondFactor(path, jar);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "reverification_required" });
    }
  });

  it("refuses to add a method with Google alone", async () => {
    const { email } = await passkeyUser("pk-google-only");
    const attacker = await signInFirstFactor(email);
    for (const path of ["/passkey/registration", "/totp/enrollment"]) {
      const res = await postSecondFactor(path, attacker);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "already_enrolled" });
    }
    expect((await status(attacker)).passkeys).toBe(1);
  });
});
