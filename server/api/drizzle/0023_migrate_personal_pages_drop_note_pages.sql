-- 0023: Migrate legacy personal pages (`pages.note_id IS NULL`) into each owner's
-- default note, promote `pages.note_id` to NOT NULL, and drop `note_pages`.
--
-- 0023: 旧個人ページ（`pages.note_id IS NULL`）を所有者のデフォルトノートへ移し、
-- `pages.note_id` を NOT NULL に昇格し、`note_pages` を DROP する。
--
-- Idempotent / re-run safety: INSERT uses NOT EXISTS guards plus
-- ON CONFLICT aligned with partial unique index `idx_notes_unique_default_per_owner`;
-- DELETE targets orphans only.

-- 1) Orphan personal pages whose owner row no longer exists — delete before NOT NULL
DELETE FROM "pages"
WHERE "note_id" IS NULL
  AND "owner_id" NOT IN (SELECT "id" FROM "user");
--> statement-breakpoint

-- 2) Safety net: ensure users who still have NULL note_id rows have a default note
INSERT INTO "notes" ("owner_id", "title", "visibility", "edit_permission", "is_default")
SELECT u."id", COALESCE(u."name", '') || 'のノート', 'private', 'owner_only', true
FROM "user" u
WHERE EXISTS (
    SELECT 1 FROM "pages" p
    WHERE p."owner_id" = u."id" AND p."note_id" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "notes" n
    WHERE n."owner_id" = u."id"
      AND n."is_default" = true
      AND n."is_deleted" = false
  )
ON CONFLICT ("owner_id") WHERE ("is_default" = true AND "is_deleted" = false) DO NOTHING;
--> statement-breakpoint

-- 3) Backfill personal pages into the owner's default note
UPDATE "pages" p
SET "note_id" = (
  SELECT n."id" FROM "notes" n
  WHERE n."owner_id" = p."owner_id"
    AND n."is_default" = true
    AND n."is_deleted" = false
  LIMIT 1
)
WHERE p."note_id" IS NULL;
--> statement-breakpoint

-- 4) Promote to NOT NULL
ALTER TABLE "pages" ALTER COLUMN "note_id" SET NOT NULL;
--> statement-breakpoint

-- 5) Drop link table (single membership model — Issue #823)
DROP TABLE IF EXISTS "note_pages";
