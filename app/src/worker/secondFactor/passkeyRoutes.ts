import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { Hono } from "hono";
import { appOrigin } from "../auth";
import {
  enrollmentGate,
  finishVerification,
  hashAll,
  limitAttempts,
  readJsonObject,
  type SecondFactorContext,
  type SecondFactorEnv,
} from "./context";
import { generateRecoveryCodes } from "./recoveryCodes";
import * as store from "./store";

/** Name shown by the browser when a passkey is created. */
const RP_NAME = "Zedi";

/** The relying party: passkeys are bound to the app's host name and checked against its origin. */
function relyingParty(c: SecondFactorContext) {
  const origin = appOrigin(c.env, c.req.url);
  return { origin, rpID: new URL(origin).hostname };
}

const transportsOf = (passkey: store.StoredPasskey) =>
  passkey.transports as AuthenticatorTransport[];

const invalidPasskey = (c: SecondFactorContext) => c.json({ error: "invalid_passkey" }, 400);

/**
 * `/api/second-factor/passkey/*`: register a passkey (as the first factor or, within five
 * minutes of the second step, another one) and pass the second step with it. Verification
 * is SimpleWebAuthn's; challenges are stored per session and used once.
 * パスキーの登録と、パスキーでの 2 段階目。検証は SimpleWebAuthn、チャレンジはセッションごとに 1 回だけ使う。
 */
export function passkeyRoutes() {
  const routes = new Hono<SecondFactorEnv>();

  routes.post("/registration", async (c) => {
    const gate = await enrollmentGate(c);
    if (gate instanceof Response) return gate;
    const { user, sessionId } = c.get("current");
    const existing = await store.listPasskeys(c.env.DB, user.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: relyingParty(c).rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id) as Uint8Array<ArrayBuffer>,
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: transportsOf(p) })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    const now = Date.now();
    await store.saveChallenge(c.env.DB, sessionId, "register", options.challenge, now);
    if (!gate.firstFactor) return c.json({ options });
    // The first factor's recovery codes come before the passkey exists, as with the app.
    const recoveryCodes = generateRecoveryCodes();
    await store.issueRecoveryCodes(c.env.DB, user.id, await hashAll(recoveryCodes), now);
    return c.json({ options, recoveryCodes });
  });

  routes.post("/registration/confirm", async (c) => {
    const gate = await enrollmentGate(c);
    if (gate instanceof Response) return gate;
    const { user, sessionId } = c.get("current");
    const now = Date.now();
    const challenge = await store.takeChallenge(c.env.DB, sessionId, "register", now);
    if (!challenge) return c.json({ error: "no_pending_registration" }, 409);
    const { response } = await readJsonObject(c);
    const { origin, rpID } = relyingParty(c);
    const verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // A second factor: the authenticator must show the user was present, not who they are.
      requireUserVerification: false,
    }).catch(() => null);
    if (!verification?.verified) return invalidPasskey(c);
    const { credential } = verification.registrationInfo;
    const saved = await store.savePasskey(
      c.env.DB,
      user.id,
      {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        name: "パスキー",
      },
      now,
    );
    if (!saved) return invalidPasskey(c);
    return finishVerification(c, {});
  });

  routes.post("/authentication", async (c) => {
    const { user, sessionId } = c.get("current");
    const passkeys = await store.listPasskeys(c.env.DB, user.id);
    if (passkeys.length === 0) return c.json({ error: "not_enrolled" }, 409);
    const options = await generateAuthenticationOptions({
      rpID: relyingParty(c).rpID,
      allowCredentials: passkeys.map((p) => ({ id: p.id, transports: transportsOf(p) })),
      userVerification: "preferred",
    });
    await store.saveChallenge(c.env.DB, sessionId, "authenticate", options.challenge, Date.now());
    return c.json({ options });
  });

  routes.post("/authentication/verify", async (c) => {
    const { user, sessionId } = c.get("current");
    const limited = await limitAttempts(c);
    if (limited) return limited;
    const now = Date.now();
    const challenge = await store.takeChallenge(c.env.DB, sessionId, "authenticate", now);
    const response = (await readJsonObject(c)).response as AuthenticationResponseJSON | undefined;
    if (!challenge || typeof response?.id !== "string") return invalidPasskey(c);
    const passkey = (await store.listPasskeys(c.env.DB, user.id)).find((p) => p.id === response.id);
    if (!passkey) return invalidPasskey(c);
    const { origin, rpID } = relyingParty(c);
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: transportsOf(passkey),
      },
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) return invalidPasskey(c);
    const { newCounter } = result.authenticationInfo;
    if (
      !(await store.usePasskey(c.env.DB, user.id, passkey.id, passkey.counter, newCounter, now))
    ) {
      return invalidPasskey(c);
    }
    return finishVerification(c, {});
  });

  return routes;
}
