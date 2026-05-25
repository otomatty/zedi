import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  decryptUserAiCredential,
  encryptUserAiCredential,
  resetUserAiCredentialEncryptionKeyCache,
} from "../../services/userAiCredentialCrypto.js";

/** 32-byte test key (hex). */
const TEST_KEY_HEX = "a".repeat(64);

describe("userAiCredentialCrypto", () => {
  beforeEach(() => {
    resetUserAiCredentialEncryptionKeyCache();
    process.env.USER_AI_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  afterEach(() => {
    delete process.env.USER_AI_CREDENTIALS_ENCRYPTION_KEY;
    resetUserAiCredentialEncryptionKeyCache();
  });

  it("round-trips encrypt and decrypt", () => {
    const plain = "sk-test-key-12345";
    const blob = encryptUserAiCredential(plain);
    expect(blob).not.toContain(plain);
    expect(decryptUserAiCredential(blob)).toBe(plain);
  });

  it("produces distinct ciphertext for the same plaintext", () => {
    const a = encryptUserAiCredential("same");
    const b = encryptUserAiCredential("same");
    expect(a).not.toBe(b);
    expect(decryptUserAiCredential(a)).toBe("same");
    expect(decryptUserAiCredential(b)).toBe("same");
  });
});
