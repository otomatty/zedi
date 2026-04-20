-- Add `sources` and `page_sources` tables for the LLM Wiki ingest flow.
-- LLM Wiki ingest フロー用の sources / page_sources テーブルを追加する。
--
-- sources: immutable raw material (URL / conversation) ingested into the wiki.
-- page_sources: M:N junction between mutable pages and immutable sources.
--
-- See parent issue otomatty/zedi#594, sub-issue #595.

CREATE TABLE "sources" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "kind" text DEFAULT 'url' NOT NULL,
    "url" text,
    "title" text,
    "content_hash" text,
    "excerpt" text,
    "extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_sources" (
    "page_id" uuid NOT NULL,
    "source_id" uuid NOT NULL,
    "section_anchor" text DEFAULT '' NOT NULL,
    "citation_text" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "page_sources_page_id_source_id_section_anchor_pk"
        PRIMARY KEY ("page_id", "source_id", "section_anchor")
);
--> statement-breakpoint
ALTER TABLE "sources"
    ADD CONSTRAINT "sources_owner_id_user_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_sources"
    ADD CONSTRAINT "page_sources_page_id_pages_id_fk"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_sources"
    ADD CONSTRAINT "page_sources_source_id_sources_id_fk"
    FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_sources_owner_id" ON "sources" ("owner_id");
--> statement-breakpoint
CREATE INDEX "idx_sources_kind" ON "sources" ("kind");
--> statement-breakpoint
CREATE INDEX "idx_sources_owner_content_hash" ON "sources" ("owner_id", "content_hash");
--> statement-breakpoint
CREATE INDEX "idx_sources_owner_url" ON "sources" ("owner_id", "url");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sources_owner_url_hash"
    ON "sources" ("owner_id", "url", "content_hash")
    WHERE "url" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_page_sources_page_id" ON "page_sources" ("page_id");
--> statement-breakpoint
CREATE INDEX "idx_page_sources_source_id" ON "page_sources" ("source_id");
