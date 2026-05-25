/**
 * CRUD for encrypted user AI credentials (#951).
 * 暗号化されたユーザー AI 認証情報の CRUD。
 */
import { and, eq } from "drizzle-orm";
import { userAiCredentials, type UserAiCredentialProvider } from "../schema/userAiCredentials.js";
import type { Database } from "../types/index.js";
import {
  decryptUserAiCredential,
  encryptUserAiCredential,
  getUserAiCredentialEncryptionKey,
} from "./userAiCredentialCrypto.js";

/** Public availability shape (no secrets). 秘密情報を含まない利用可否。 */
export interface UserAiCredentialAvailability {
  provider: UserAiCredentialProvider;
  configured: boolean;
}

const ALL_PROVIDERS: readonly UserAiCredentialProvider[] = ["anthropic", "openai", "google"];

/**
 * Whether server-side credential storage is configured (encryption key present).
 * サーバー側 credential 保管が有効か（暗号化鍵が設定されているか）。
 */
export function isUserAiCredentialStorageEnabled(): boolean {
  try {
    getUserAiCredentialEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * List which providers have a stored credential for the user.
 * ユーザーが登録済みの provider 一覧（キー本体は返さない）。
 */
export async function listUserAiCredentialAvailability(
  userId: string,
  db: Database,
): Promise<UserAiCredentialAvailability[]> {
  if (!isUserAiCredentialStorageEnabled()) {
    return ALL_PROVIDERS.map((provider) => ({ provider, configured: false }));
  }
  const rows = await db
    .select({ provider: userAiCredentials.provider })
    .from(userAiCredentials)
    .where(eq(userAiCredentials.userId, userId));
  const configured = new Set(rows.map((r) => r.provider));
  return ALL_PROVIDERS.map((provider) => ({
    provider,
    configured: configured.has(provider),
  }));
}

/**
 * Upsert an encrypted API key for a provider.
 * provider 向け API キーを暗号化して upsert する。
 */
export async function upsertUserAiCredential(
  userId: string,
  provider: UserAiCredentialProvider,
  apiKey: string,
  db: Database,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key is required");
  }
  const encryptedApiKey = encryptUserAiCredential(trimmed);
  const id = `${userId}:${provider}`;
  const now = new Date();
  await db
    .insert(userAiCredentials)
    .values({
      id,
      userId,
      provider,
      encryptedApiKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userAiCredentials.userId, userAiCredentials.provider],
      set: {
        encryptedApiKey,
        updatedAt: now,
      },
    });
}

/**
 * Remove a stored credential.
 * 保存済み credential を削除する。
 */
export async function deleteUserAiCredential(
  userId: string,
  provider: UserAiCredentialProvider,
  db: Database,
): Promise<boolean> {
  const result = await db
    .delete(userAiCredentials)
    .where(and(eq(userAiCredentials.userId, userId), eq(userAiCredentials.provider, provider)))
    .returning({ id: userAiCredentials.id });
  return result.length > 0;
}

/**
 * Decrypt the stored API key for a provider (server-only).
 * provider の API キーを復号する（サーバー内部専用）。
 */
export async function getUserAiCredentialPlaintext(
  userId: string,
  provider: UserAiCredentialProvider,
  db: Database,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userAiCredentials)
    .where(and(eq(userAiCredentials.userId, userId), eq(userAiCredentials.provider, provider)))
    .limit(1);
  if (!row) return null;
  return decryptUserAiCredential(row.encryptedApiKey);
}
