-- 0031: Add `wiki_compose_sessions` — meta-row table for Wiki Compose runs.
-- Wiki Compose (LangGraph) の実行メタテーブルを追加する。
--
-- 1 行 = 1 セッション。session.id は LangGraph の thread_id として再利用される。
-- LangGraph の checkpoint 系テーブル (checkpoints / checkpoint_blobs /
-- checkpoint_writes) は `PostgresSaver.setup()` 側で別管理するため、本
-- migration では作成しない。
--
-- One row per compose run. The session id doubles as the LangGraph
-- `thread_id`. The internal `checkpoints*` tables are owned by
-- `PostgresSaver.setup()` and intentionally excluded from this migration.
--
-- Issue: otomatty/zedi#948 (P0 — LangGraph 基盤)
--
-- Idempotent / re-run safety: CREATE TABLE/INDEX IF NOT EXISTS and the FK ADD
-- block is wrapped in a duplicate-object guard.

CREATE TABLE IF NOT EXISTS "wiki_compose_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL,
    "user_id" text NOT NULL,
    "graph_id" text NOT NULL,
    "phase" text DEFAULT 'init' NOT NULL,
    "backend" text DEFAULT 'zedi_managed' NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "metadata" jsonb,
    "last_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "closed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "wiki_compose_sessions"
        ADD CONSTRAINT "wiki_compose_sessions_page_id_pages_id_fk"
        FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "wiki_compose_sessions"
        ADD CONSTRAINT "wiki_compose_sessions_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_compose_sessions_page_id"
    ON "wiki_compose_sessions" ("page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_compose_sessions_user_id"
    ON "wiki_compose_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_compose_sessions_page_active_updated"
    ON "wiki_compose_sessions" ("page_id", "updated_at" DESC)
    WHERE "status" IN ('pending', 'running', 'interrupted');
