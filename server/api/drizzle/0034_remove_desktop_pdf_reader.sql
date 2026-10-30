-- Remove the local PDF reader, which only worked in the desktop (Tauri) app that has been
-- dropped. Its highlights, its `pdf_local` sources and the source columns only it used are
-- deleted. Pages created from highlights are ordinary pages and stay; only their citation
-- rows in `page_sources` go away with the sources (ON DELETE CASCADE).
-- デスクトップ版（Tauri）の廃止に伴い、デスクトップ専用だったローカル PDF リーダーを削除する。
-- ハイライト、`pdf_local` のソース、PDF だけが使っていた sources の列を削除する。
-- ハイライトから作ったページは通常のページなので残る（`page_sources` の引用行のみ CASCADE で消える）。

DROP TABLE IF EXISTS "pdf_highlights";
--> statement-breakpoint
DELETE FROM "sources" WHERE "kind" = 'pdf_local';
--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN IF EXISTS "display_name";
--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN IF EXISTS "byte_size";
--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN IF EXISTS "page_count";
--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN IF EXISTS "metadata";
