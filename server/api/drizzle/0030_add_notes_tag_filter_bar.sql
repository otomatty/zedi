-- 0030: Add per-note tag filter bar defaults to `notes`.
--
-- これらのカラムは `/notes/:noteId` 上部のハッシュタグフィルタバーの「ノート
-- 既定値」を持つ。ユーザー側はデバイスごとに localStorage で上書きできる
-- (`zedi-note-filter-preferences`)。選択中タグそのものは URL クエリ
-- `?tags=` に乗せるためここには保存しない。
--
-- Stores the note-side defaults for the tag filter bar shown above the page
-- list on `/notes/:noteId`. Each device may override `show_tag_filter_bar`
-- via localStorage. The currently-selected tags live in `?tags=` and are not
-- persisted here.
--
-- `default_filter_tags` は小文字キーで保存し、`__none__` トークンを含めると
-- 「タグなしページのみ」が既定になる。配列が空のときはオーナーが既定の絞り
-- 込みを指定していない状態。
--
-- `default_filter_tags` stores lower-cased keys. Including the `__none__`
-- token defaults the filter to "untagged only". An empty array means the
-- owner has not picked any defaults.

ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "show_tag_filter_bar" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "default_filter_tags" text[] NOT NULL DEFAULT '{}'::text[];
