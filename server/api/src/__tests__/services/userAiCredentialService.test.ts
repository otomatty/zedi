/**
 * userAiCredentialService の単体テスト。
 * DB は `createMockDb` でモックし、暗号化は本物（`userAiCredentialCrypto`）を
 * 使って encrypt→decrypt のラウンドトリップと復号失敗時のフォールバックを検証する。
 *
 * Unit tests for userAiCredentialService. The DB is mocked via `createMockDb`
 * while the real crypto module is used so the encryption round-trip and the
 * decrypt-failure fallback are exercised end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  deleteUserAiCredential,
  getUserAiCredentialPlaintext,
  isUserAiCredentialStorageEnabled,
  listUserAiCredentialAvailability,
  upsertUserAiCredential,
} from "../../services/userAiCredentialService.js";
import {
  decryptUserAiCredential,
  encryptUserAiCredential,
  resetUserAiCredentialEncryptionKeyCache,
} from "../../services/userAiCredentialCrypto.js";
import { createMockDb } from "../createMockDb.js";
import type { Database } from "../../types/index.js";

/** 32-byte test key (hex). テスト用 32 バイト鍵。 */
const TEST_KEY_HEX = "a".repeat(64);

function enableStorage() {
  resetUserAiCredentialEncryptionKeyCache();
  process.env.USER_AI_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY_HEX;
}

function disableStorage() {
  delete process.env.USER_AI_CREDENTIALS_ENCRYPTION_KEY;
  resetUserAiCredentialEncryptionKeyCache();
}

describe("userAiCredentialService", () => {
  afterEach(() => {
    disableStorage();
  });

  describe("isUserAiCredentialStorageEnabled", () => {
    it("暗号化鍵が設定されていれば true / true when the encryption key is configured", () => {
      enableStorage();
      expect(isUserAiCredentialStorageEnabled()).toBe(true);
    });

    it("暗号化鍵が無ければ false / false when the encryption key is missing", () => {
      disableStorage();
      expect(isUserAiCredentialStorageEnabled()).toBe(false);
    });
  });

  describe("listUserAiCredentialAvailability", () => {
    it("登録済み provider だけ configured: true で全 provider を返す / marks only stored providers as configured", async () => {
      enableStorage();
      const { db } = createMockDb([[{ provider: "openai" }]]);

      const result = await listUserAiCredentialAvailability("u1", db as unknown as Database);

      expect(result).toEqual([
        { provider: "anthropic", configured: false },
        { provider: "openai", configured: true },
        { provider: "google", configured: false },
      ]);
    });

    it("ストレージ無効時は DB を読まず全 provider を configured: false で返す / returns all-false without querying when storage is disabled", async () => {
      disableStorage();
      const { db, chains } = createMockDb([]);

      const result = await listUserAiCredentialAvailability("u1", db as unknown as Database);

      expect(result).toEqual([
        { provider: "anthropic", configured: false },
        { provider: "openai", configured: false },
        { provider: "google", configured: false },
      ]);
      // ストレージ無効時はクエリを一切発行しない。
      // No query is issued when storage is disabled.
      expect(chains).toHaveLength(0);
    });
  });

  describe("upsertUserAiCredential", () => {
    it("API キーを暗号化して upsert し、保存値は decrypt で元に戻る / stores an encrypted key that round-trips on decrypt", async () => {
      enableStorage();
      const { db, chains } = createMockDb([undefined]);

      await upsertUserAiCredential("u1", "openai", "sk-secret-123", db as unknown as Database);

      const valuesOp = chains[0]?.ops.find((o) => o.method === "values");
      const row = valuesOp?.args[0] as { id: string; userId: string; encryptedApiKey: string };
      expect(row.id).toBe("u1:openai");
      expect(row.userId).toBe("u1");
      // 暗号文に平文が混ざっていないこと、そして復号で元の平文に戻ること。
      // Ciphertext must not leak the plaintext, and must decrypt back to it.
      expect(row.encryptedApiKey).not.toContain("sk-secret-123");
      expect(decryptUserAiCredential(row.encryptedApiKey)).toBe("sk-secret-123");
    });

    it("前後の空白を除いてから暗号化する / trims surrounding whitespace before encrypting", async () => {
      enableStorage();
      const { db, chains } = createMockDb([undefined]);

      await upsertUserAiCredential("u1", "anthropic", "  sk-trim  ", db as unknown as Database);

      const valuesOp = chains[0]?.ops.find((o) => o.method === "values");
      const row = valuesOp?.args[0] as { encryptedApiKey: string };
      expect(decryptUserAiCredential(row.encryptedApiKey)).toBe("sk-trim");
    });

    it("空白のみのキーは 'API key is required' で拒否する / rejects a whitespace-only key", async () => {
      enableStorage();
      const { db, chains } = createMockDb([undefined]);

      await expect(
        upsertUserAiCredential("u1", "openai", "   ", db as unknown as Database),
      ).rejects.toThrow("API key is required");
      // バリデーション失敗時は DB へ書き込まない。
      // No write is attempted when validation fails.
      expect(chains).toHaveLength(0);
    });
  });

  describe("deleteUserAiCredential", () => {
    it("行が削除されれば true を返す / returns true when a row was deleted", async () => {
      const { db } = createMockDb([[{ id: "u1:openai" }]]);

      const result = await deleteUserAiCredential("u1", "openai", db as unknown as Database);

      expect(result).toBe(true);
    });

    it("該当行が無ければ false を返す / returns false when no row matched", async () => {
      const { db } = createMockDb([[]]);

      const result = await deleteUserAiCredential("u1", "openai", db as unknown as Database);

      expect(result).toBe(false);
    });
  });

  describe("getUserAiCredentialPlaintext", () => {
    it("保存済み暗号文を復号して平文を返す / decrypts a stored blob back to plaintext", async () => {
      enableStorage();
      const blob = encryptUserAiCredential("sk-roundtrip");
      const { db } = createMockDb([[{ encryptedApiKey: blob }]]);

      const result = await getUserAiCredentialPlaintext("u1", "openai", db as unknown as Database);

      expect(result).toBe("sk-roundtrip");
    });

    it("ストレージ無効時は DB を読まず null を返す / returns null without querying when storage is disabled", async () => {
      disableStorage();
      const { db, chains } = createMockDb([]);

      const result = await getUserAiCredentialPlaintext("u1", "openai", db as unknown as Database);

      expect(result).toBeNull();
      expect(chains).toHaveLength(0);
    });

    it("該当行が無ければ null を返す / returns null when no credential row exists", async () => {
      enableStorage();
      const { db } = createMockDb([[]]);

      const result = await getUserAiCredentialPlaintext("u1", "openai", db as unknown as Database);

      expect(result).toBeNull();
    });

    it("復号できない壊れた blob は未設定扱いで null を返す / treats an undecryptable blob as missing (null)", async () => {
      // マスター鍵ローテーション等で復号不能になった行は 400 ではなく未設定扱い。
      // A row that can no longer be decrypted (e.g. key rotation) is treated as
      // missing rather than surfacing a decrypt error.
      enableStorage();
      const { db } = createMockDb([[{ encryptedApiKey: "not-a-valid-blob" }]]);

      const result = await getUserAiCredentialPlaintext("u1", "openai", db as unknown as Database);

      expect(result).toBeNull();
    });
  });
});
