-- Add `pages.note_id` so pages can be scoped either to an individual user (NULL,
-- "personal page") or to a specific note (non-null, "note-native page"). Personal
-- home queries filter on `note_id IS NULL`; note deletion cascades to note-native
-- pages. See issue #713.
--
-- `pages.note_id` を追加してページを「個人ページ（NULL）」と「ノート所属ページ
-- （値あり）」にスコープ分けできるようにする。個人ホームの一覧は
-- `note_id IS NULL` で絞り込み、ノート削除時は ON DELETE CASCADE で
-- ノートネイティブページを一緒に削除する。Issue #713 を参照。

ALTER TABLE "pages" ADD COLUMN "note_id" uuid;
--> statement-breakpoint
ALTER TABLE "pages"
    ADD CONSTRAINT "pages_note_id_notes_id_fk"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_pages_note_id" ON "pages" ("note_id");
