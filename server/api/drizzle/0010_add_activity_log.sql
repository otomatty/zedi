-- Add `activity_log` table for Wiki-level actions (P4, otomatty/zedi#598).
-- Wiki レベルの行動履歴（ingest / chat 昇格 / lint 実行 / wiki 生成等）を記録する
-- append-only ログ。`ai_usage_logs`（課金）や `admin_audit_logs`（管理者監査）
-- とは用途が異なり、ユーザーの Wiki がどう育ったかを時系列で可視化する。
--
-- See parent epic otomatty/zedi#594, sub-issue #598.

CREATE TABLE "activity_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "kind" text NOT NULL,
    "actor" text NOT NULL,
    "target_page_ids" text[] DEFAULT '{}' NOT NULL,
    "detail" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log"
    ADD CONSTRAINT "activity_log_owner_id_user_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_activity_log_owner_created" ON "activity_log" ("owner_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "idx_activity_log_owner_kind_created"
    ON "activity_log" ("owner_id", "kind", "created_at" DESC);
