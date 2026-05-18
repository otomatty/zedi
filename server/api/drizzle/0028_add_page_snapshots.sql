-- 0028: Add `page_snapshots`, the storage table used by page version history.
-- ページ履歴・復元・Hocuspocus 自動スナップショットで利用する
-- `page_snapshots` テーブルを追加する。
--
-- `server/api/src/schema/pageSnapshots.ts` and Hocuspocus `snapshotUtils.ts`
-- already reference this table. Without this migration, develop Railway logs
-- show `relation "page_snapshots" does not exist` during auto-save.
--
-- `server/api/src/schema/pageSnapshots.ts` と Hocuspocus の `snapshotUtils.ts`
-- は既にこのテーブルを参照しているため、migration が無い環境では自動保存時に
-- `relation "page_snapshots" does not exist` が発生する。
--
-- Idempotent / re-run safety: CREATE TABLE/INDEX IF NOT EXISTS and duplicate
-- FK constraints are ignored.

CREATE TABLE IF NOT EXISTS "page_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL,
    "version" bigint NOT NULL,
    "ydoc_state" bytea NOT NULL,
    "content_text" text,
    "created_by" text,
    "trigger" text DEFAULT 'auto' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "page_snapshots"
        ADD CONSTRAINT "page_snapshots_page_id_pages_id_fk"
        FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_page_snapshots_page_id"
    ON "page_snapshots" ("page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_page_snapshots_page_created"
    ON "page_snapshots" ("page_id", "created_at");
