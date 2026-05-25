/**
 * AES-256-GCM encryption for `user_ai_credentials.encrypted_api_key` (#951).
 *
 * `user_ai_credentials` 用の at-rest 暗号化。鍵管理方針:
 *
 * - **鍵の所在**: 本番・開発とも `USER_AI_CREDENTIALS_ENCRYPTION_KEY` 環境変数
 *   のみ（32 バイト raw、Base64 または hex で指定）。DB・ログ・クライアントへ
 *   鍵を書き込まない。
 * - **ローテーション**: 新鍵を設定したうえで既存行を再保存（upsert）する運用。
 *   旧鍵での復号に失敗した行は利用者がキーを再登録する。
 * - **形式**: `base64(iv[12] || authTag[16] || ciphertext)` — クライアント
 *   `src/lib/encryption.ts` とは別鍵・別用途（ブラウザ localStorage 用）。
 *
 * Key management:
 * - **Source of truth**: env `USER_AI_CREDENTIALS_ENCRYPTION_KEY` only (32 raw
 *   bytes as Base64 or hex). Never persist the key in DB, logs, or the client.
 * - **Rotation**: set a new env key and re-upsert credentials; rows that fail
 *   decrypt require the user to re-register.
 * - **Wire format**: `base64(iv[12] || authTag[16] || ciphertext)` — distinct
 *   from browser `src/lib/encryption.ts` (localStorage, per-device key).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

/**
 * Load the 32-byte encryption key from the environment (memoized).
 * 環境変数から 32 バイト鍵を読み込む（メモ化）。
 */
export function getUserAiCredentialEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.USER_AI_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("USER_AI_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `USER_AI_CREDENTIALS_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length})`,
    );
  }
  cachedKey = key;
  return key;
}

/** Reset cached key (tests only). テスト用にキャッシュをクリア。 */
export function resetUserAiCredentialEncryptionKeyCache(): void {
  cachedKey = null;
}

/**
 * Encrypt a plaintext API key for storage.
 * 平文 API キーを DB 保存用に暗号化する。
 */
export function encryptUserAiCredential(plaintext: string): string {
  const key = getUserAiCredentialEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a stored credential blob.
 * 保存済み blob を復号する。
 */
export function decryptUserAiCredential(ciphertext: string): string {
  const key = getUserAiCredentialEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted credential blob");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
