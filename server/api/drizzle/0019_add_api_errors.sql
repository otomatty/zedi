-- Add `api_errors` table — aggregated summary of API errors detected by Sentry.
-- Sentry が検知した API エラーの集約サマリ用テーブルを追加する。
--
-- 生のスタックトレース・パラメータは Sentry 側に保持し、本テーブルでは
-- `sentry_issue_id` をユニークキーとした「issue 単位の状態」のみ持つ。
-- Webhook ハンドラは `INSERT ... ON CONFLICT (sentry_issue_id) DO UPDATE` で
-- `occurrences` を加算し `last_seen_at` を前進させる（`first_seen_at` は保持）。
--
-- Raw stack traces / payloads stay in Sentry; this table only stores the
-- per-issue aggregation (occurrence count, severity, status, AI analysis,
-- GitHub issue mapping) keyed on `sentry_issue_id`. The webhook upserts via
-- `ON CONFLICT (sentry_issue_id) DO UPDATE` to bump `occurrences` and advance
-- `last_seen_at` while preserving `first_seen_at`.
--
-- See parent epic otomatty/zedi#616, sub-issue #802.

CREATE TABLE IF NOT EXISTS "api_errors" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "sentry_issue_id" text NOT NULL,
    "fingerprint" text,
    "title" text NOT NULL,
    "route" text,
    "status_code" integer,
    "occurrences" integer DEFAULT 1 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
    "severity" text DEFAULT 'unknown' NOT NULL,
    "status" text DEFAULT 'open' NOT NULL,
    "ai_summary" text,
    "ai_suspected_files" jsonb,
    "ai_root_cause" text,
    "ai_suggested_fix" text,
    "github_issue_number" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "api_errors_sentry_issue_id_unique" UNIQUE ("sentry_issue_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_errors_status_last_seen"
    ON "api_errors" ("status", "last_seen_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_errors_severity_status"
    ON "api_errors" ("severity", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_errors_last_seen"
    ON "api_errors" ("last_seen_at" DESC);
