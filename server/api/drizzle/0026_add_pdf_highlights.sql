-- Add the `pdf_highlights` table for the PDF knowledge ingestion feature.
-- ローカル PDF のハイライト（テキスト選択範囲 + 任意メモ）を保持するテーブル。
--
-- 1 行 = 1 ハイライト。`source_id` は `sources.id` (kind="pdf_local") を参照する。
-- `derived_page_id` はそのハイライトから派生した Zedi ページへの逆参照（オプション）。
-- 正準の「ページ ↔ ソース」関係は引き続き `page_sources` を介して表現する。
--
-- One row = one highlight. `source_id` references `sources(id)` for the parent
-- PDF source. `derived_page_id` is an optional back-pointer to the Zedi page
-- created from this highlight; the canonical page↔source linkage continues to
-- live in `page_sources`.
--
-- See parent issue otomatty/zedi#389.

CREATE TABLE IF NOT EXISTS "pdf_highlights" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source_id" uuid NOT NULL,
    "owner_id" text NOT NULL,
    "derived_page_id" uuid,
    "pdf_page" integer NOT NULL,
    "rects" jsonb NOT NULL,
    "text" text NOT NULL,
    "color" text DEFAULT 'yellow' NOT NULL,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "pdf_highlights"
        ADD CONSTRAINT "pdf_highlights_source_id_sources_id_fk"
        FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "pdf_highlights"
        ADD CONSTRAINT "pdf_highlights_owner_id_user_id_fk"
        FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "pdf_highlights"
        ADD CONSTRAINT "pdf_highlights_derived_page_id_pages_id_fk"
        FOREIGN KEY ("derived_page_id") REFERENCES "pages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pdf_highlights_source_id"
    ON "pdf_highlights" ("source_id", "pdf_page");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pdf_highlights_owner_id"
    ON "pdf_highlights" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pdf_highlights_derived_page_id"
    ON "pdf_highlights" ("derived_page_id");
