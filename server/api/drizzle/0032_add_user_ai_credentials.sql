-- 0032: Encrypted BYOK API credentials for Wiki Compose (#951).
-- Wiki Compose BYOK 用のユーザー API キー（サーバー側暗号化保管）。
--
-- Plaintext keys are never stored. See `userAiCredentials` schema TSDoc.
-- 平文キーは保存しない。`user_ai_credentials` の TSDoc を参照。
--
-- Issue: otomatty/zedi#951

CREATE TABLE IF NOT EXISTS "user_ai_credentials" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "encrypted_api_key" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "user_ai_credentials"
        ADD CONSTRAINT "user_ai_credentials_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "user_ai_credentials"
        ADD CONSTRAINT "user_ai_credentials_provider_valid"
        CHECK ("provider" IN ('anthropic', 'openai', 'google'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_ai_credentials_user_provider"
    ON "user_ai_credentials" ("user_id", "provider");
