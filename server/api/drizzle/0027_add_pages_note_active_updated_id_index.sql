-- 0027: Issue #860 Phase 2 — keyset cursor pagination 用に `pages` の
-- `(note_id, updated_at DESC, id DESC) WHERE is_deleted = false` 部分複合
-- インデックスを追加する。`GET /api/notes/:noteId/pages` の
-- `WHERE note_id = $1 AND is_deleted = false
--    AND (updated_at < $cur_ts OR (updated_at = $cur_ts AND id < $cur_id))
--  ORDER BY updated_at DESC, id DESC` を index-only で進められるようにし、
-- `(updated_at, id)` の tie-break もインデックス内で完結させる。既存の
-- `idx_pages_note_active_updated` は `(note_id, updated_at DESC)` のままなので、
-- 旧 detail エンドポイント側のクエリプランは変化しない。重複可否は今 phase
-- では判断せず、本 phase ではまず併存させて EXPLAIN で確認する。
--
-- 0027: Issue #860 Phase 2 — add the partial composite index
-- `pages (note_id, updated_at DESC, id DESC) WHERE is_deleted = false` so the
-- keyset cursor pagination on `GET /api/notes/:noteId/pages` (added in Phase
-- 1) can satisfy
-- `WHERE note_id = $1 AND is_deleted = false
--    AND (updated_at < $cur_ts OR (updated_at = $cur_ts AND id < $cur_id))
--  ORDER BY updated_at DESC, id DESC`
-- as an index-only scan, including the `(updated_at, id)` tie-break leg. The
-- existing `idx_pages_note_active_updated` remains intact so the legacy note
-- detail listing keeps its current plan. Deciding whether the old index can
-- be dropped is deferred to a later phase once production query plans are
-- confirmed.
--
-- Idempotent / re-run safety: CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "idx_pages_note_active_updated_id"
  ON "pages" ("note_id", "updated_at" DESC, "id" DESC)
  WHERE "is_deleted" = false;
