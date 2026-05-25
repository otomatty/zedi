import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Provider ids stored for BYOK credentials (matches {@link AIProviderType} subset).
 * BYOK 用 credential の provider 識別子（`AIProviderType` のサブセット）。
 */
export type UserAiCredentialProvider = "anthropic" | "openai" | "google";

/**
 * Server-side encrypted user API keys for Wiki Compose BYOK (#951).
 *
 * 平文 API キーは保存しない。`encrypted_api_key` は AES-256-GCM で暗号化した
 * blob（IV + auth tag + ciphertext）を Base64 で格納する。復号鍵は環境変数
 * `USER_AI_CREDENTIALS_ENCRYPTION_KEY`（32 バイト）のみが保持する。
 *
 * Plaintext API keys are never stored. `encrypted_api_key` holds a Base64 blob
 * (IV + auth tag + ciphertext) from AES-256-GCM. Only
 * `USER_AI_CREDENTIALS_ENCRYPTION_KEY` (32 bytes) can decrypt at runtime.
 *
 * @see {@link encryptUserAiCredential} / {@link decryptUserAiCredential}
 */
export const userAiCredentials = pgTable(
  "user_ai_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["anthropic", "openai", "google"] }).notNull(),
    /** AES-256-GCM encrypted secret (never plaintext). 平文ではない暗号化 blob。 */
    encryptedApiKey: text("encrypted_api_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_user_ai_credentials_user_provider").on(table.userId, table.provider),
  ],
);

/** Selected row type for `user_ai_credentials`. `user_ai_credentials` の取得行型。 */
export type UserAiCredential = typeof userAiCredentials.$inferSelect;
/** Insert type for `user_ai_credentials`. `user_ai_credentials` の挿入型。 */
export type NewUserAiCredential = typeof userAiCredentials.$inferInsert;
