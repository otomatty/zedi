-- Add is_schema flag to pages table for wiki schema pages.
-- Wiki の「憲法」ページを識別するフラグを pages テーブルに追加する。
ALTER TABLE "pages" ADD COLUMN "is_schema" boolean DEFAULT false NOT NULL;

-- Partial unique index: at most one schema page per owner.
-- オーナーごとにスキーマページは最大 1 つ。
CREATE UNIQUE INDEX "idx_pages_unique_schema_per_owner"
  ON "pages" ("owner_id")
  WHERE "is_schema" = true AND "is_deleted" = false;
