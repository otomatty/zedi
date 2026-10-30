-- Zedi PoC D1 schema (SQLite). Mirrors src/worker/db/schema.ts.
-- Better Auth core tables
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX session_user_id ON session (user_id);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX account_user_id ON account (user_id);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX verification_identifier ON verification (identifier);

-- Notes and sharing
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX notes_one_default_per_owner ON notes (owner_id) WHERE is_default = 1;

CREATE TABLE note_members (
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX note_members_user ON note_members (user_id);

-- Pages: `seq` is a stable rowid for the external-content FTS5 index.
CREATE TABLE pages (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX pages_note_recent ON pages (note_id, updated_at DESC, id DESC);

-- Full-text search (trigram works for Japanese without a morphological analyzer).
-- External content: the index stores no copy of the text, it reads it from `pages`.
CREATE VIRTUAL TABLE pages_fts USING fts5 (
  title,
  content_text,
  content = 'pages',
  content_rowid = 'seq',
  tokenize = 'trigram'
);

CREATE TRIGGER pages_after_insert AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts (rowid, title, content_text) VALUES (new.seq, new.title, new.content_text);
  UPDATE notes SET page_count = page_count + 1 WHERE id = new.note_id;
END;

CREATE TRIGGER pages_after_delete AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts (pages_fts, rowid, title, content_text) VALUES ('delete', old.seq, old.title, old.content_text);
  UPDATE notes SET page_count = page_count - 1 WHERE id = old.note_id;
END;

CREATE TRIGGER pages_after_update AFTER UPDATE OF title, content_text ON pages BEGIN
  INSERT INTO pages_fts (pages_fts, rowid, title, content_text) VALUES ('delete', old.seq, old.title, old.content_text);
  INSERT INTO pages_fts (rowid, title, content_text) VALUES (new.seq, new.title, new.content_text);
END;

-- Development-only: magic links are written here instead of being emailed.
CREATE TABLE dev_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
