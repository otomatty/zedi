-- Add file-backed metadata columns to `sources` so a `kind="pdf_local"` row can
-- carry display name, byte size, page count, and free-form metadata without
-- introducing a separate `documents` table.
-- ローカル PDF などのファイル系ソース向けに `sources` に表示用メタ列を追加する。
-- 別途 `documents` テーブルを作らず、kind="pdf_local" の行に NULL 可能な列を
-- 載せる方針。
--
-- 重要: PDF の実体パスは絶対にここに保存しない。実パスは Tauri 側のローカル
-- レジストリ (`pdf_sources.json`) のみが保持する。
-- IMPORTANT: the actual filesystem path is NEVER stored in this table. The
-- Tauri-side local registry (`pdf_sources.json`) is the only place that knows
-- where the bytes live, so PDF binaries stay out of the sync surface.
--
-- See parent issue otomatty/zedi#389.

ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "display_name" text;
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "byte_size" bigint;
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "page_count" integer;
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
