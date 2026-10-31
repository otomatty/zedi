import { describe, expect, it } from "vitest";
import { RECOVERY_CODE_COUNT, generateRecoveryCodes, hashRecoveryCode } from "./recoveryCodes";

describe("generateRecoveryCodes", () => {
  it("issues ten distinct codes of 16 unambiguous characters in groups of four", () => {
    const codes = generateRecoveryCodes();
    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      // Crockford Base32: no I, L, O or U, so codes read back without confusion (80 bits).
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    }
  });

  it("issues new codes every time", () => {
    expect(generateRecoveryCodes(1)[0]).not.toBe(generateRecoveryCodes(1)[0]);
  });
});

describe("hashRecoveryCode", () => {
  const code = "7K3M-Q9TR-X2VA-HH5W";

  it("stores a SHA-256 hex digest, never the code itself", async () => {
    const hash = await hashRecoveryCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("7K3M");
  });

  it("gives the same hash however the code is typed", async () => {
    const hash = await hashRecoveryCode(code);
    for (const typed of ["7k3m-q9tr-x2va-hh5w", "7K3MQ9TRX2VAHH5W", " 7K3M Q9TR X2VA HH5W "]) {
      expect(await hashRecoveryCode(typed)).toBe(hash);
    }
  });

  it("reads the letters people confuse with digits as those digits", async () => {
    expect(await hashRecoveryCode("1110-0000-0000-0000")).toBe(
      await hashRecoveryCode("ILlo-oOoO-0000-0000"),
    );
  });

  it("gives different codes different hashes", async () => {
    expect(await hashRecoveryCode("7K3M-Q9TR-X2VA-HH5X")).not.toBe(await hashRecoveryCode(code));
  });

  it.each(["", "7K3M-Q9TR-X2VA", "7K3M-Q9TR-X2VA-HH5W-0000", "7K3M-Q9TR-X2VA-HH5U", "7K3M+Q9TR"])(
    "rejects %j, which cannot be a recovery code",
    async (typed) => {
      expect(await hashRecoveryCode(typed)).toBeNull();
    },
  );
});
