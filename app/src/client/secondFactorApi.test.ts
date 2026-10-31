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
  ] as const)("%s posts JSON to %s", async (method, args, url, body) => {
    respond(200, {});
    await (secondFactorApi[method] as (...a: string[]) => Promise<unknown>)(...args);
    expect(calls[0]?.url).toBe(url);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(body);
  });

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
