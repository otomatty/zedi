-- Add `special_kind` column to `pages` for Wiki "index" / "log" pseudo-pages
-- (P4, otomatty/zedi#598).
-- Karpathy LLM Wiki パターンの `__index__` / `__log__` 相当の特殊ページを
-- `pages` テーブル内で表現するためのカラム。NULL は通常ページ。

ALTER TABLE "pages" ADD COLUMN "special_kind" text;
--> statement-breakpoint
CREATE INDEX "idx_pages_owner_special_kind" ON "pages" ("owner_id", "special_kind");
--> statement-breakpoint
-- 部分ユニークインデックス: オーナーごとに各 special_kind は最大 1 行（非削除のもの）。
-- Partial unique: at most one row per (owner_id, special_kind) among non-deleted pages.
CREATE UNIQUE INDEX "idx_pages_unique_special_kind_per_owner"
  ON "pages" ("owner_id", "special_kind")
  WHERE "special_kind" IS NOT NULL AND "is_deleted" = false;
