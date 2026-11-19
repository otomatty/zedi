import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secretBox";

const KEY = "better-auth-secret-for-tests-000000000000";
// What gets sealed: a Base32 TOTP secret (an RFC 6238 test value, not a real one).
const PLAINTEXT = "GEZDGNBVGY3TQOJQ";

describe("secretBox", () => {
  it("opens what it sealed", async () => {
    expect(await openSecret(KEY, await sealSecret(KEY, PLAINTEXT))).toBe(PLAINTEXT);
  });

  it("does not store the plaintext, and seals it differently every time", async () => {
    const first = await sealSecret(KEY, PLAINTEXT);
    expect(first).not.toContain(PLAINTEXT);
    expect(await sealSecret(KEY, PLAINTEXT)).not.toBe(first);
  });

  it("cannot be opened with another key", async () => {
    const sealed = await sealSecret(KEY, PLAINTEXT);
    expect(await openSecret(`${KEY}-other`, sealed)).toBeNull();
  });

  it("cannot be opened with the auth secret used directly", async () => {
    // 秘密鍵の暗号化には、認証の秘密そのものではなく用途ごとに導いた鍵を使う。
    // The box uses a key derived for this purpose, not the auth secret itself.
    const { symmetricDecrypt } = await import("better-auth/crypto");
    const sealed = await sealSecret(KEY, PLAINTEXT);
    await expect(symmetricDecrypt({ key: KEY, data: sealed })).rejects.toThrow();
  });

  it("keeps purposes apart: a box opens only for the purpose it was sealed for", async () => {
    const offer = await sealSecret(KEY, PLAINTEXT, "recovery-code-offer");
    expect(await openSecret(KEY, offer, "recovery-code-offer")).toBe(PLAINTEXT);
    expect(await openSecret(KEY, offer)).toBeNull();
    expect(
      await openSecret(KEY, await sealSecret(KEY, PLAINTEXT), "recovery-code-offer"),
    ).toBeNull();
  });

  it("rejects a tampered or malformed box", async () => {
    const sealed = await sealSecret(KEY, PLAINTEXT);
    const flipped = `${sealed.slice(0, -1)}${sealed.endsWith("0") ? "1" : "0"}`;
    expect(await openSecret(KEY, flipped)).toBeNull();
    expect(await openSecret(KEY, "not-hex")).toBeNull();
    expect(await openSecret(KEY, "")).toBeNull();
  });
});
