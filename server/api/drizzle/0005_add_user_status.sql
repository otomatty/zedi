-- Add user status columns for suspend/unsuspend functionality.
-- ユーザーのサスペンド/復活機能のための status カラムを追加する。
--
-- status: 'active' (default), 'suspended', or 'deleted'
-- suspended_at: timestamp when the user was suspended
-- suspended_reason: optional reason for suspension
-- suspended_by: admin user who performed the suspension

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspended_by" text;

-- Ensure existing rows have 'active' status
-- 既存行のステータスを 'active' に設定する
UPDATE "user"
SET "status" = 'active'
WHERE "status" IS NULL OR "status" NOT IN ('active', 'suspended', 'deleted');

-- Add CHECK constraint for valid status values
-- 有効なステータス値の CHECK 制約を追加する
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_status_check";
ALTER TABLE "user" ADD CONSTRAINT "user_status_check"
  CHECK ("status" IN ('active', 'suspended', 'deleted'));

-- Add foreign key for suspended_by referencing user(id)
-- suspended_by のユーザー外部キーを追加する
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_suspended_by_user_id_fk";
ALTER TABLE "user" ADD CONSTRAINT "user_suspended_by_user_id_fk"
  FOREIGN KEY ("suspended_by") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

-- Add index on status for efficient filtering
-- ステータスのフィルタリング用インデックスを追加する
CREATE INDEX IF NOT EXISTS "idx_user_status" ON "user" ("status");
