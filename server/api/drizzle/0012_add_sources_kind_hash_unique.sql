-- Add a partial unique index on `sources` for rows without a URL.
-- URL の無い sources (kind="conversation" 等) を (owner, kind, content_hash) で
-- 一意にする部分ユニーク制約を追加する。
--
-- Why / 背景:
--   既存の `uq_sources_owner_url_hash` は `WHERE url IS NOT NULL` の部分インデックス
--   なので、kind="conversation" のように url が NULL のレコードは重複検出されない。
--   そのため `POST /api/ingest/apply` で同一 contentHash を持つ会話が並行で投入されると
--   2 件入ってしまい、`ON CONFLICT DO NOTHING + re-SELECT` の race-safe path が機能しない。
--   この部分ユニーク制約を入れることで、url=NULL の場合も DB レベルで重複が阻止され、
--   勝者の行に決定的に収束する。
--
--   The existing `uq_sources_owner_url_hash` is partial (`WHERE url IS NOT NULL`), so
--   conversation rows without a URL can race past `ON CONFLICT DO NOTHING` and end up
--   duplicated. This partial unique index closes that gap, deterministically
--   converging concurrent inserts on a single winner that the re-SELECT can find.
--
-- See PR otomatty/zedi#645 (CodeRabbit review feedback on ingest.ts).

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sources_owner_kind_hash_when_url_null"
    ON "sources" ("owner_id", "kind", "content_hash")
    WHERE "url" IS NULL AND "content_hash" IS NOT NULL;
