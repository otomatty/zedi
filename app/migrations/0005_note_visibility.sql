-- Note visibility for signed-in readers. Mirrors src/worker/db/schema.ts.
ALTER TABLE notes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public'));
