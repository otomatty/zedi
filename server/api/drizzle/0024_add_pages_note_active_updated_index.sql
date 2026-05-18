-- 0024: `pages` テーブルに `(note_id, updated_at DESC) WHERE is_deleted = false`
-- の部分複合インデックスを追加する。`GET /api/notes/:id` のページ列挙クエリ
-- (`WHERE note_id = $1 AND is_deleted = false ORDER BY updated_at DESC`)
-- 用に、ソート段を Sort ノードからインデックススキャンに切り替えるのが目的。
-- ソフト削除行を WHERE で除外することでインデックスサイズも最小化する。
-- 詳細は Epic #847 / Issue #850 を参照。
--
-- 0024: Add a partial composite index on
-- `pages (note_id, updated_at DESC) WHERE is_deleted = false`. Backs the page
-- listing in `GET /api/notes/:id`
-- (`WHERE note_id = $1 AND is_deleted = false ORDER BY updated_at DESC`) by
-- letting the note-scoped sort run as an index scan instead of an in-memory
-- Sort. The partial predicate keeps soft-deleted rows out of the index so the
-- size stays minimal. See Epic #847 / issue #850 for the rationale.
--
-- Idempotent / re-run safety: CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "idx_pages_note_active_updated"
  ON "pages" ("note_id", "updated_at" DESC)
  WHERE "is_deleted" = false;
