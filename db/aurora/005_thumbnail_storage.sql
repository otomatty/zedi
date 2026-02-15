-- Thumbnail storage: per-user S3 usage and tier quotas (free/pro).
-- Used by Thumbnail API Lambda (commit endpoint).
-- Apply after 004_plan_rename.sql.

-- =============================================================================
-- thumbnail_tier_quotas: storage limit per tier (bytes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS thumbnail_tier_quotas (
  tier                VARCHAR(32) PRIMARY KEY,
  storage_limit_bytes  BIGINT NOT NULL
);

INSERT INTO thumbnail_tier_quotas (tier, storage_limit_bytes) VALUES
  ('free', 10 * 1024 * 1024),   -- 10 MB
  ('pro',  100 * 1024 * 1024)   -- 100 MB
ON CONFLICT (tier) DO NOTHING;

-- =============================================================================
-- thumbnail_objects: one row per uploaded thumbnail (for usage sum)
-- =============================================================================
CREATE TABLE IF NOT EXISTS thumbnail_objects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  s3_key     VARCHAR(512) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_objects_user_id ON thumbnail_objects (user_id);
