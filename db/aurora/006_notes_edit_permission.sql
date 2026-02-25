-- Notes: add edit_permission column (view vs edit permission separation)
-- See: docs/specs/note-permissions-design.md
-- Apply after 005_thumbnail_storage.sql

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS edit_permission TEXT NOT NULL DEFAULT 'owner_only'
  CHECK (edit_permission IN ('owner_only', 'members_editors', 'any_logged_in'));

CREATE INDEX IF NOT EXISTS idx_notes_edit_permission ON notes(edit_permission);
