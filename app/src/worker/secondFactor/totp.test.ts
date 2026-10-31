import { describe, expect, it } from "vitest";
import { generateTotpSecret, matchTotp, totpCode, totpStep, totpUri } from "./totp";

// RFC 6238 Appendix B (SHA-1): the ASCII key "12345678901234567890", Base32-encoded.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const at = (seconds: number) => seconds * 1000;

describe("TOTP (RFC 6238, SHA-1, 6 digits, 30 s)", () => {
  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
  ])("matches the RFC 6238 test vector at T=%i", async (seconds, expected) => {
    expect(await totpCode(RFC_SECRET, totpStep(at(seconds)))).toBe(expected);
  });

  it("counts 30-second steps", () => {
    expect(totpStep(at(29.999))).toBe(0);
    expect(totpStep(at(30))).toBe(1);
    expect(totpStep(at(1_234_567_890))).toBe(41_152_263);
  });

  it("accepts the current step and one step either side, and says which one matched", async () => {
    const now = at(1_234_567_890);
    const step = totpStep(now);
    for (const offset of [-1, 0, 1]) {
      const code = await totpCode(RFC_SECRET, step + offset);
      expect(await matchTotp(RFC_SECRET, code, now)).toBe(step + offset);
    }
  });

  it("rejects codes two or more steps away", async () => {
    const now = at(1_234_567_890);
    const step = totpStep(now);
    expect(await matchTotp(RFC_SECRET, await totpCode(RFC_SECRET, step - 2), now)).toBeNull();
    expect(await matchTotp(RFC_SECRET, await totpCode(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it("ignores the spaces authenticator apps show inside a code", async () => {
    expect(await matchTotp(RFC_SECRET, " 287 082 ", at(59))).toBe(1);
  });

  it.each(["", "28708", "2870820", "28708a", "２８７０８２"])(
    "rejects a malformed code %j",
    async (code) => {
      expect(await matchTotp(RFC_SECRET, code, at(59))).toBeNull();
    },
  );

  it("rejects a code for another secret", async () => {
    const other = generateTotpSecret();
    expect(await matchTotp(other, "287082", at(59))).toBeNull();
  });
});

describe("generateTotpSecret", () => {
  it("returns 160 random bits as unpadded Base32", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });
});

describe("totpUri", () => {
  it("builds the otpauth URI authenticator apps read from the QR code", () => {
    const uri = new URL(
      totpUri({ secret: RFC_SECRET, account: "alice@test.zedi-note.app", issuer: "Zedi" }),
    );
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/Zedi:alice@test.zedi-note.app");
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: RFC_SECRET,
      issuer: "Zedi",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
  });
});
