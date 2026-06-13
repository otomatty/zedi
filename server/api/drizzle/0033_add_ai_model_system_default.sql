-- Add system default flag to ai_models so admins can designate a fallback model.
-- 管理者がシステム既定モデルを指定できるよう ai_models にフラグを追加する。
ALTER TABLE "ai_models" ADD COLUMN IF NOT EXISTS "is_system_default" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_models_system_default_unique"
  ON "ai_models" ("is_system_default")
  WHERE "is_system_default" = true;
