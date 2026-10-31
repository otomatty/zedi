import { env } from "cloudflare:test";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import { inspectSql, resetStatements } from "../secondFactor/adminReset";
import { totpCode, totpStep } from "../secondFactor/totp";
import {
  BASE,
  enrolledFactors,
  passSecondFactor,
  postSecondFactor,
  signInFirstFactor,
  uniqueEmail,
  type CookieJar,
} from "./helpers";
import { SoftAuthenticator } from "./softAuthenticator";

/** Runs the reset as wrangler would run its file: all statements in one transaction. */
async function reset(email: string) {
  await env.DB.batch(resetStatements(email).map((sql) => env.DB.prepare(sql)));
}

interface Inspected {
  id: string;
  email: string;
  created_at: number;
  passkeys: number;
  authenticator_app: number;
  recovery_codes_left: number;
  sessions: number;
}

async function inspect(email: string): Promise<Inspected | null> {
  return (await env.DB.prepare(inspectSql(email)).first<Inspected>()) ?? null;
}

/** A user with the app, a passkey and recovery codes, signed in on two sessions. */
async function userWithEverything(label: string) {
  const email = uniqueEmail(label);
  const jar = await signInFirstFactor(email);
  await passSecondFactor(email, jar);
  const start = await postSecondFactor("/passkey/registration", jar);
  const { options } = (await start.json()) as { options: PublicKeyCredentialCreationOptionsJSON };
  const passkey = await SoftAuthenticator.create();
  const added = await postSecondFactor("/passkey/registration/confirm", jar, {
    response: await passkey.register(options, BASE),
  });
  expect(added.status).toBe(200);
  const other = await signInFirstFactor(email);
  await passSecondFactor(email, other);
  return { email, jar, other };
}

/**
 * The status a session gets once its cookie cache is gone (it lasts five minutes): without the
 * signed copy of the session, Better Auth reads D1, which is where the reset ended it.
 */
const statusWithoutCache = async (jar: CookieJar) => {
  const uncached: CookieJar = new Map([...jar].filter(([name]) => !name.includes("session_data")));
  const res = await postSecondFactor("/totp/verify", uncached, { code: "000000" });
  return res.status;
};

describe("admin recovery: clearing a user's second factor", () => {
  it("shows what the user has before anything changes", async () => {
    const { email } = await userWithEverything("reset-inspect");
    // A third session passes with a recovery code, which no longer counts as left.
    const third = await signInFirstFactor(email);
    const code = enrolledFactors(email).recoveryCodes[0];
    expect((await postSecondFactor("/recovery-code/verify", third, { code })).status).toBe(200);
    expect(await inspect(email)).toMatchObject({
      email,
      passkeys: 1,
      authenticator_app: 1,
      recovery_codes_left: 9,
      sessions: 3,
    });
    expect(await inspect(uniqueEmail("nobody"))).toBeNull();
  });

  it("removes every method and code and ends every session of that user only", async () => {
    const { email, jar, other } = await userWithEverything("reset-target");
    const bystander = await userWithEverything("reset-bystander");
    await reset(email);

    expect(await inspect(email)).toMatchObject({
      passkeys: 0,
      authenticator_app: 0,
      recovery_codes_left: 0,
      sessions: 0,
    });
    // Both old sessions are gone from D1, so neither is signed in once its cache runs out.
    expect(await statusWithoutCache(jar)).toBe(401);
    expect(await statusWithoutCache(other)).toBe(401);
    expect(await inspect(bystander.email)).toMatchObject({
      passkeys: 1,
      authenticator_app: 1,
      recovery_codes_left: 10,
      sessions: 2,
    });
  });

  it("does not let an old session register a method in the gap, even while its cookie cache lasts", async () => {
    const { email, jar } = await userWithEverything("reset-gap");
    await reset(email);
    // The jar still holds the signed cookie cache, which Better Auth would trust for five
    // minutes; with no method left, Google alone could otherwise register the first one.
    expect([...jar.keys()].some((name) => name.includes("session_data"))).toBe(true);
    expect((await postSecondFactor("/totp/enrollment", jar)).status).toBe(401);
    expect((await postSecondFactor("/passkey/registration", jar)).status).toBe(401);
    expect(await inspect(email)).toMatchObject({ authenticator_app: 0, passkeys: 0 });
  });

  it("keeps the account, its Google link and its notes", async () => {
    const { email } = await userWithEverything("reset-keeps");
    const before = await inspect(email);
    const count = (sql: string) => env.DB.prepare(sql).bind(before?.id).first<{ n: number }>();
    const notes = await count("SELECT COUNT(*) AS n FROM notes WHERE owner_id = ?1");
    await reset(email);
    expect((await inspect(email))?.id).toBe(before?.id);
    expect(await count("SELECT COUNT(*) AS n FROM account WHERE user_id = ?1")).toEqual({ n: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM notes WHERE owner_id = ?1")).toEqual(notes);
  });

  it("lets the next Google sign-in register a new first method with new recovery codes", async () => {
    const { email } = await userWithEverything("reset-again");
    const oldCode = enrolledFactors(email).recoveryCodes[0] ?? "";
    await reset(email);

    const jar = await signInFirstFactor(email);
    const start = await postSecondFactor("/totp/enrollment", jar);
    expect(start.status).toBe(200);
    const { secret, recoveryCodes } = (await start.json()) as {
      secret: string;
      recoveryCodes?: string[];
    };
    expect(recoveryCodes).toHaveLength(10);
    const confirm = await postSecondFactor("/totp/enrollment/confirm", jar, {
      code: await totpCode(secret, totpStep(Date.now())),
    });
    expect(confirm.status).toBe(200);

    const next = await signInFirstFactor(email);
    expect((await postSecondFactor("/recovery-code/verify", next, { code: oldCode })).status).toBe(
      400,
    );
    expect(
      (await postSecondFactor("/recovery-code/verify", next, { code: recoveryCodes?.[0] })).status,
    ).toBe(200);
  });

  it("works for an address with an apostrophe", async () => {
    const email = `o'brien-${crypto.randomUUID()}@example.com`;
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?1, 'O', ?2, ?3, ?3)",
      ).bind(id, email, now),
      env.DB.prepare(
        "INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?1, 'h', ?2)",
      ).bind(id, now),
    ]);
    expect(await inspect(email)).toMatchObject({ id, recovery_codes_left: 1 });
    await reset(email);
    expect(await inspect(email)).toMatchObject({ id, recovery_codes_left: 0 });
  });
});
