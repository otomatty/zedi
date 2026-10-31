import { afterEach, describe, expect, it, vi } from "vitest";
import { SecondFactorError, secondFactorApi } from "./secondFactorApi";

let calls: { url: string; init?: RequestInit }[] = [];

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("secondFactorApi", () => {
  it("reads the status", async () => {
    respond(200, { verified: false, totp: true, recoveryCodesRemaining: 9 });
    expect(await secondFactorApi.status()).toEqual({
      verified: false,
      totp: true,
      recoveryCodesRemaining: 9,
    });
    expect(calls[0]?.url).toBe("/api/second-factor");
  });

  it.each([
    ["startEnrollment", [], "/api/second-factor/totp/enrollment", {}],
    [
      "confirmEnrollment",
      ["123456"],
      "/api/second-factor/totp/enrollment/confirm",
      { code: "123456" },
    ],
    ["verifyTotp", ["123456"], "/api/second-factor/totp/verify", { code: "123456" }],
    [
      "verifyRecoveryCode",
      ["AAAA-BBBB-CCCC-DDDD"],
      "/api/second-factor/recovery-code/verify",
      { code: "AAAA-BBBB-CCCC-DDDD" },
    ],
    ["startPasskeyRegistration", [], "/api/second-factor/passkey/registration", {}],
    ["startPasskeyAuthentication", [], "/api/second-factor/passkey/authentication", {}],
  ] as const)("%s posts JSON to %s", async (method, args, url, body) => {
    respond(200, {});
    await (secondFactorApi[method] as (...a: string[]) => Promise<unknown>)(...args);
    expect(calls[0]?.url).toBe(url);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(body);
  });

  it.each([
    ["confirmPasskeyRegistration", "/api/second-factor/passkey/registration/confirm"],
    ["verifyPasskey", "/api/second-factor/passkey/authentication/verify"],
  ] as const)("%s posts the browser's WebAuthn response to %s", async (method, url) => {
    respond(200, {});
    const response = { id: "cred", type: "public-key" } as never;
    await secondFactorApi[method](response);
    expect(calls[0]?.url).toBe(url);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ response });
  });

  it.each(["invalid_passkey", "no_pending_registration", "reverification_required"])(
    "keeps the server's reason %j",
    async (reason) => {
      respond(400, { error: reason });
      await expect(secondFactorApi.startPasskeyRegistration()).rejects.toMatchObject({ reason });
    },
  );

  it("lists the methods for the settings page", async () => {
    const listed = { passkeys: [], totp: true, recoveryCodesRemaining: 10, recentlyVerified: true };
    respond(200, listed);
    expect(await secondFactorApi.methods()).toEqual(listed);
    expect(calls[0]?.url).toBe("/api/second-factor/methods");
    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
  });

  it.each([
    ["deletePasskey", ["a/b+c"], "/api/second-factor/passkeys/a%2Fb%2Bc", "DELETE"],
    ["deleteTotp", [], "/api/second-factor/totp", "DELETE"],
  ] as const)("%s sends %s %s and accepts an empty 204", async (method, args, url, verb) => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        calls.push({ url: u, init });
        return new Response(null, { status: 204 });
      }),
    );
    await (secondFactorApi[method] as (...a: string[]) => Promise<unknown>)(...args);
    expect(calls[0]?.url).toBe(url);
    expect(calls[0]?.init?.method).toBe(verb);
  });

  it("asks for new recovery codes, then switches to them with the offer", async () => {
    respond(200, { recoveryCodes: ["A"], offer: "OFFER" });
    expect(await secondFactorApi.newRecoveryCodes()).toEqual({
      recoveryCodes: ["A"],
      offer: "OFFER",
    });
    expect(calls[0]?.url).toBe("/api/second-factor/recovery-codes");
    expect(calls[0]?.init?.method).toBe("POST");

    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        calls.push({ url: u, init });
        return new Response(null, { status: 204 });
      }),
    );
    await secondFactorApi.confirmRecoveryCodes("OFFER");
    expect(calls[0]?.url).toBe("/api/second-factor/recovery-codes/confirm");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ offer: "OFFER" });
  });

  it.each(["last_factor", "not_found", "second_factor_required", "invalid_offer"])(
    "keeps the management refusal %j",
    async (reason) => {
      respond(409, { error: reason });
      await expect(secondFactorApi.deleteTotp()).rejects.toMatchObject({ reason });
    },
  );

  it("returns what the server sends back", async () => {
    respond(200, { secret: "S", uri: "otpauth://totp/x", recoveryCodes: ["A", "B"] });
    expect(await secondFactorApi.startEnrollment()).toEqual({
      secret: "S",
      uri: "otpauth://totp/x",
      recoveryCodes: ["A", "B"],
    });
  });

  it("turns refusals into errors that say why", async () => {
    respond(400, { error: "invalid_code" });
    await expect(secondFactorApi.verifyTotp("000000")).rejects.toMatchObject({
      reason: "invalid_code",
    });

    respond(401, { error: "unauthorized" });
    await expect(secondFactorApi.verifyTotp("000000")).rejects.toMatchObject({
      reason: "unauthorized",
    });

    respond(409, { error: "already_enrolled" });
    await expect(secondFactorApi.startEnrollment()).rejects.toMatchObject({
      reason: "already_enrolled",
    });
  });

  it("says how long to wait when there were too many attempts", async () => {
    respond(429, { error: "too_many_attempts" }, { "retry-after": "125" });
    const error = await secondFactorApi.verifyTotp("000000").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SecondFactorError);
    expect(error).toMatchObject({ reason: "too_many_attempts", retryAfterSeconds: 125 });
  });

  it("reports an unexpected answer as such", async () => {
    respond(500, "oops");
    await expect(secondFactorApi.status()).rejects.toMatchObject({ reason: "unexpected" });
  });
});
