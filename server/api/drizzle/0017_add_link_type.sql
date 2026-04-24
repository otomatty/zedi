-- Add `link_type` column to `links` and `ghost_links` so the same graph structure
-- can discriminate between WikiLinks (`[[Title]]`) and tags (`#name`). Existing
-- rows are backfilled to 'wiki' to preserve current behaviour. The primary keys
-- are widened to include `link_type` so a single page pair (or link_text) can
-- carry both a wiki-link edge and a tag edge independently. See issue #725
-- (Phase 1).
--
-- `links` と `ghost_links` に `link_type` カラムを追加し、同じグラフ構造で
-- WikiLink (`[[Title]]`) とタグ (`#name`) を区別できるようにする。既存行は
-- 挙動を保つため `'wiki'` として埋める。同一ページ対（または link_text）が
-- 独立に WikiLink とタグのエッジを持てるよう、主キーに `link_type` を含める。
-- Issue #725 Phase 1 を参照。

ALTER TABLE "links" ADD COLUMN "link_type" text NOT NULL DEFAULT 'wiki';
--> statement-breakpoint
ALTER TABLE "links"
    ADD CONSTRAINT "links_link_type_valid"
    CHECK ("link_type" IN ('wiki', 'tag'));
--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_source_id_target_id_pk";
--> statement-breakpoint
ALTER TABLE "links"
    ADD CONSTRAINT "links_source_id_target_id_link_type_pk"
    PRIMARY KEY ("source_id", "target_id", "link_type");
--> statement-breakpoint
CREATE INDEX "idx_links_link_type" ON "links" ("link_type");
--> statement-breakpoint
ALTER TABLE "ghost_links" ADD COLUMN "link_type" text NOT NULL DEFAULT 'wiki';
--> statement-breakpoint
ALTER TABLE "ghost_links"
    ADD CONSTRAINT "ghost_links_link_type_valid"
    CHECK ("link_type" IN ('wiki', 'tag'));
--> statement-breakpoint
ALTER TABLE "ghost_links" DROP CONSTRAINT "ghost_links_link_text_source_page_id_pk";
--> statement-breakpoint
ALTER TABLE "ghost_links"
    ADD CONSTRAINT "ghost_links_link_text_source_page_id_link_type_pk"
    PRIMARY KEY ("link_text", "source_page_id", "link_type");
--> statement-breakpoint
CREATE INDEX "idx_ghost_links_link_type" ON "ghost_links" ("link_type");
