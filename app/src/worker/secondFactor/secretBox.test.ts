import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secretBox";

const KEY = "better-auth-secret-for-tests-000000000000";

describe("secretBox", () => {
  it("opens what it sealed", async () => {
    expect(await openSecret(KEY, await sealSecret(KEY, "GEZDGNBVGY3TQOJQ"))).toBe(
      "GEZDGNBVGY3TQOJQ",
    );
  });

  it("does not store the plaintext, and seals it differently every time", async () => {
    const first = await sealSecret(KEY, "GEZDGNBVGY3TQOJQ");
    expect(first).not.toContain("GEZDGNBVGY3TQOJQ");
    expect(await sealSecret(KEY, "GEZDGNBVGY3TQOJQ")).not.toBe(first);
  });

  it("cannot be opened with another key", async () => {
    const sealed = await sealSecret(KEY, "GEZDGNBVGY3TQOJQ");
    expect(await openSecret(`${KEY}-other`, sealed)).toBeNull();
  });

  it("cannot be opened with the auth secret used directly", async () => {
    // 秘密鍵の暗号化には、認証の秘密そのものではなく用途ごとに導いた鍵を使う。
    // The box uses a key derived for this purpose, not the auth secret itself.
    const { symmetricDecrypt } = await import("better-auth/crypto");
    const sealed = await sealSecret(KEY, "GEZDGNBVGY3TQOJQ");
    await expect(symmetricDecrypt({ key: KEY, data: sealed })).rejects.toThrow();
  });

  it("rejects a tampered or malformed box", async () => {
    const sealed = await sealSecret(KEY, "GEZDGNBVGY3TQOJQ");
    const flipped = `${sealed.slice(0, -1)}${sealed.endsWith("0") ? "1" : "0"}`;
    expect(await openSecret(KEY, flipped)).toBeNull();
    expect(await openSecret(KEY, "not-hex")).toBeNull();
    expect(await openSecret(KEY, "")).toBeNull();
  });
});
