-- Migration: 001_add_notes_tables
-- Description: Add notes, note_pages, and note_members tables for sharing feature
-- Date: 2026-01-23

-- 公開ノート
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility);

-- ノート内ページ
CREATE TABLE IF NOT EXISTS note_pages (
    note_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_note_pages_note ON note_pages(note_id);
CREATE INDEX IF NOT EXISTS idx_note_pages_page ON note_pages(page_id);

-- ノートメンバー
CREATE TABLE IF NOT EXISTS note_members (
    note_id TEXT NOT NULL,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    invited_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_note_members_note ON note_members(note_id);
CREATE INDEX IF NOT EXISTS idx_note_members_email ON note_members(member_email);
