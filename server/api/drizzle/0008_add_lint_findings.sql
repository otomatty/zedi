-- Add `lint_findings` table for Wiki Lint engine results.
-- Wiki Lint エンジンの検出結果を永続化する lint_findings テーブルを追加する。
--
-- Stores findings from batch or on-demand lint runs for
-- orphan pages, ghost link excess, title similarity, conflicts, and broken links.
--
-- See parent issue otomatty/zedi#594, sub-issue #596.

CREATE TABLE "lint_findings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "rule" text NOT NULL,
    "severity" text NOT NULL,
    "page_ids" text[] NOT NULL,
    "detail" jsonb,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lint_findings"
    ADD CONSTRAINT "lint_findings_owner_id_user_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_lint_findings_owner_id" ON "lint_findings" ("owner_id");
--> statement-breakpoint
CREATE INDEX "idx_lint_findings_rule" ON "lint_findings" ("rule");
--> statement-breakpoint
CREATE INDEX "idx_lint_findings_owner_rule" ON "lint_findings" ("owner_id", "rule");
