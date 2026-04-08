-- Migration: 002_add_page_snapshots
-- Description: Add page_snapshots table for page version history
-- Date: 2026-04-07

-- ページスナップショット（バージョン履歴）
-- Page snapshots (version history)
CREATE TABLE IF NOT EXISTS page_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    version BIGINT NOT NULL,
    ydoc_state BYTEA NOT NULL,
    content_text TEXT,
    created_by TEXT,
    trigger TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_snapshots_page_id ON page_snapshots(page_id);
CREATE INDEX IF NOT EXISTS idx_page_snapshots_page_created ON page_snapshots(page_id, created_at DESC);
