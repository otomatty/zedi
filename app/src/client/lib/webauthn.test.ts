import { describe, expect, it } from "vitest";
import { passkeyFailure, passkeysUsableOn } from "./webauthn";

describe("passkeyFailure", () => {
  it("reads a dismissed or timed-out prompt as cancelled", () => {
    expect(passkeyFailure(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toBe(
      "cancelled",
    );
    expect(passkeyFailure(Object.assign(new Error("x"), { name: "AbortError" }))).toBe("cancelled");
    expect(passkeyFailure(Object.assign(new Error("x"), { code: "ERROR_CEREMONY_ABORTED" }))).toBe(
      "cancelled",
    );
  });

  it("reads an authenticator that already holds one of the user's passkeys", () => {
    const error = Object.assign(new Error("x"), {
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
    });
    expect(passkeyFailure(error)).toBe("alreadyRegistered");
  });

  it("reads anything else as a failure", () => {
    expect(passkeyFailure(new Error("x"))).toBe("failed");
    expect(passkeyFailure("x")).toBe("failed");
  });
});

describe("passkeysUsableOn", () => {
  it("accepts host names", () => {
    expect(passkeysUsableOn("zedi-note.app")).toBe(true);
    expect(passkeysUsableOn("staging.zedi-note.app")).toBe(true);
    expect(passkeysUsableOn("localhost")).toBe(true);
  });

  it("rejects IP addresses, which WebAuthn does not accept as the relying party", () => {
    expect(passkeysUsableOn("127.0.0.1")).toBe(false);
    expect(passkeysUsableOn("192.168.0.10")).toBe(false);
    expect(passkeysUsableOn("[::1]")).toBe(false);
  });
});
