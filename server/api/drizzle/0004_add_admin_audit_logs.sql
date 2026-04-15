-- Add admin_audit_logs table to record administrative actions for compliance and forensics.
-- 管理操作の監査ログテーブルを追加する（コンプライアンス・インシデント調査用）。
-- Append-only from the application perspective (GET-only API); the DB level leaves
-- UPDATE/DELETE permissions to role separation handled outside this migration.

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_user_id" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "before" jsonb,
  "after" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "admin_audit_logs"
  DROP CONSTRAINT IF EXISTS "admin_audit_logs_actor_user_id_user_id_fk";
ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_actor_user_id_user_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_actor_created"
  ON "admin_audit_logs" ("actor_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_target_created"
  ON "admin_audit_logs" ("target_type", "target_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_action_created"
  ON "admin_audit_logs" ("action", "created_at" DESC);
