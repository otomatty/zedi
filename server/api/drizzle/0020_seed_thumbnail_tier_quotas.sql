-- Seed thumbnail_tier_quotas with default storage limits per subscription tier.
-- サブスクリプションプランごとのサムネイル保存容量の既定値を投入する。
--
-- Without this seed the table is empty and `commitService.getStorageQuotaBytes`
-- silently falls back to a 10 MB ceiling (commitService.ts), causing every
-- user to hit STORAGE_QUOTA_EXCEEDED (HTTP 413) after just a handful of web
-- clips because typical og:image assets are 0.5–2 MB each.
-- このシードが無いとテーブルは空のままで、`commitService.getStorageQuotaBytes`
-- のフォールバック値 10 MB が適用される。og:image は 1 件あたり 0.5–2 MB あり、
-- 数件クリップしただけで全ユーザーが 413 を踏むため、必ずシードする。
--
-- Safe to re-run: uses ON CONFLICT DO UPDATE so reseeding picks up
-- limit adjustments without manual cleanup.
-- ON CONFLICT DO UPDATE で冪等。容量調整時の再実行も安全。

INSERT INTO thumbnail_tier_quotas (tier, storage_limit_bytes)
VALUES
  ('free', 104857600),     -- 100 MB
  ('pro',  10737418240)    -- 10 GB
ON CONFLICT (tier) DO UPDATE
  SET storage_limit_bytes = EXCLUDED.storage_limit_bytes;
