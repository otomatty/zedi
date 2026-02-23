import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, clearEncryptionKey } from "./encryption";

const hasSubtle = typeof globalThis.crypto?.subtle !== "undefined";

describe("encryption", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.skipIf(!hasSubtle)("encrypt then decrypt returns original plaintext", async () => {
    const plaintext = "Hello, World!";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it.skipIf(!hasSubtle)("encrypt produces different output each time", async () => {
    const plaintext = "Same input";
    const a = await encrypt(plaintext);
    const b = await encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("clearEncryptionKey removes key from localStorage", async () => {
    if (hasSubtle) {
      await encrypt("trigger key generation");
      expect(localStorage.getItem("zedi-encryption-key")).not.toBeNull();
    } else {
      localStorage.setItem("zedi-encryption-key", "dummy");
    }
    clearEncryptionKey();
    expect(localStorage.getItem("zedi-encryption-key")).toBeNull();
  });

  it.skipIf(!hasSubtle)("works with empty string", async () => {
    const encrypted = await encrypt("");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it.skipIf(!hasSubtle)("works with unicode text", async () => {
    const plaintext = "日本語テスト 🎉 émojis & spëcial chars";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
