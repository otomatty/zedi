-- Notes: add is_official flag and view_count for Discover / popular / official notes
-- See: docs/specs/notes-list-and-discover.md
-- Apply after 006_notes_edit_permission.sql

ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS view_count  INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notes_is_official ON notes(is_official);
