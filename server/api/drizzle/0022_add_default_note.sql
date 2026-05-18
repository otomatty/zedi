-- 0022: Default note (additive). Add `notes.is_default` and create one default
-- note per existing user titled `'<users.name>のノート'`. This is the additive
-- foundation for the "every page belongs to a note" model — a follow-up
-- migration will backfill personal pages into the default note, drop the
-- `note_pages` link table, and promote `pages.note_id` to NOT NULL.
--
-- 0022: デフォルトノート（追加のみ）。`notes.is_default` カラムを追加し、
-- 既存ユーザー全員に「<users.name>のノート」というタイトルのデフォルトノートを
-- 1 件ずつ作成する。これは「すべてのページはノートに属する」モデルへの土台で、
-- 既存個人ページをデフォルトノートに移行し `note_pages` を廃止する破壊的変更は
-- 後続マイグレーションで行う。
--
-- IF NOT EXISTS / re-run safety:
--   既に手動適用された開発環境でも壊れないよう、`ADD COLUMN IF NOT EXISTS`,
--   `CREATE INDEX IF NOT EXISTS`, `WHERE NOT EXISTS` を使う。
--   Use IF NOT EXISTS / NOT EXISTS guards so re-running on dev DBs that
--   already partially applied this migration manually is safe.

-- ── notes.is_default ────────────────────────────────────────────────────────
--
-- Boolean flag. Exactly one row per user has `is_default = true` (enforced by
-- the partial unique index further down). Default notes are not deletable
-- (enforced in the API layer — see `routes/notes/crud.ts`).
--
-- ユーザー 1 人につき有効なデフォルトノートは 1 件のみ（部分ユニーク index で
-- 担保）。削除拒否はアプリケーション層（`routes/notes/crud.ts`）で行う。

ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- ── Partial unique index: at most one default note per owner ───────────────
--
-- Prevents a user from ending up with two active default notes through any
-- code path (auto-creation race, manual SQL, etc.). Soft-deleted defaults
-- (`is_deleted = true`) are excluded from the predicate so a future
-- "restore" flow can re-create one without needing to clear the flag.
--
-- 1 ユーザーにつき有効なデフォルトノートは 1 件のみ。論理削除済みの行は
-- 述語から除外し、将来の「復元」フローで作り直せる余地を残す。

CREATE UNIQUE INDEX IF NOT EXISTS "idx_notes_unique_default_per_owner"
  ON "notes" ("owner_id")
  WHERE "is_default" = true AND "is_deleted" = false;
--> statement-breakpoint

-- ── Default-note backfill ──────────────────────────────────────────────────
--
-- Create one default note per existing user. Title follows
-- `'<users.name>のノート'`. visibility/edit_permission default to private/
-- owner_only, matching a fresh personal space. `is_default = true`.
--
-- 既存ユーザーごとにデフォルトノートを 1 件作成する。タイトルは
-- `'<users.name>のノート'`。visibility と edit_permission は private /
-- owner_only に揃える。
--
-- 既に有効なデフォルトノートを持つユーザー（`is_default = true` の行が存在）
-- はスキップする。

INSERT INTO "notes" ("owner_id", "title", "visibility", "edit_permission", "is_default")
SELECT u."id", u."name" || 'のノート', 'private', 'owner_only', true
FROM "user" u
WHERE NOT EXISTS (
  SELECT 1 FROM "notes" n
  WHERE n."owner_id" = u."id"
    AND n."is_default" = true
    AND n."is_deleted" = false
);
