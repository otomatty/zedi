-- Zedi CRDT Sync Tables
-- Run this SQL in Supabase SQL Editor to create the required tables

-- 1. Cards table
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);

-- Row Level Security
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cards" ON cards;
CREATE POLICY "Users can view own cards" ON cards
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cards" ON cards;
CREATE POLICY "Users can insert own cards" ON cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cards" ON cards;
CREATE POLICY "Users can update own cards" ON cards
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own cards" ON cards;
CREATE POLICY "Users can delete own cards" ON cards
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Links table
CREATE TABLE IF NOT EXISTS links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);

ALTER TABLE links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own links" ON links;
CREATE POLICY "Users can CRUD own links" ON links
  FOR ALL USING (auth.uid() = user_id);

-- 3. Ghost Links table
CREATE TABLE IF NOT EXISTS ghost_links (
  link_text TEXT NOT NULL,
  source_card_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (link_text, source_card_id)
);

CREATE INDEX IF NOT EXISTS idx_ghost_links_user_id ON ghost_links(user_id);

ALTER TABLE ghost_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own ghost_links" ON ghost_links;
CREATE POLICY "Users can CRUD own ghost_links" ON ghost_links
  FOR ALL USING (auth.uid() = user_id);

-- 4. Sync metadata table (tracks last sync time per device)
CREATE TABLE IF NOT EXISTS sync_metadata (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_sync_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, device_id)
);

ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own sync_metadata" ON sync_metadata;
CREATE POLICY "Users can CRUD own sync_metadata" ON sync_metadata
  FOR ALL USING (auth.uid() = user_id);
