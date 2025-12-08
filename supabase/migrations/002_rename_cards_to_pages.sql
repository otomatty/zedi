-- Zedi Migration: Rename cards to pages
-- Run this SQL in Supabase SQL Editor to migrate from cards to pages

-- Step 1: Rename the cards table to pages
ALTER TABLE IF EXISTS cards RENAME TO pages;

-- Step 2: Update indexes
DROP INDEX IF EXISTS idx_cards_user_id;
DROP INDEX IF EXISTS idx_cards_updated_at;
DROP INDEX IF EXISTS idx_cards_created_at;

CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_updated_at ON pages(updated_at);
CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at);

-- Step 3: Update RLS policies
DROP POLICY IF EXISTS "Users can view own cards" ON pages;
DROP POLICY IF EXISTS "Users can insert own cards" ON pages;
DROP POLICY IF EXISTS "Users can update own cards" ON pages;
DROP POLICY IF EXISTS "Users can delete own cards" ON pages;

CREATE POLICY "Users can view own pages" ON pages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pages" ON pages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pages" ON pages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pages" ON pages
  FOR DELETE USING (auth.uid() = user_id);

-- Step 4: Update ghost_links table column
ALTER TABLE IF EXISTS ghost_links 
  RENAME COLUMN source_card_id TO source_page_id;

-- Step 5: Update ghost_links primary key
-- Note: This requires recreating the constraint
ALTER TABLE IF EXISTS ghost_links DROP CONSTRAINT IF EXISTS ghost_links_pkey;
ALTER TABLE IF EXISTS ghost_links 
  ADD PRIMARY KEY (link_text, source_page_id);
