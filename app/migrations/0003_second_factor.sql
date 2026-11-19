-- Second factor (authenticator app and recovery codes). Mirrors src/worker/db/schema.ts.
-- When the session passed the second step; NULL right after Google sign-in.
ALTER TABLE session ADD COLUMN second_factor_at INTEGER;

-- One authenticator app per user. `secret` is encrypted; `confirmed_at` is NULL until the
-- user enters a first code. `last_used_step` stops a code from being used twice.
CREATE TABLE totp_factors (
  user_id TEXT PRIMARY KEY REFERENCES user (id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  confirmed_at INTEGER,
  last_used_step INTEGER,
  created_at INTEGER NOT NULL
);

-- Recovery codes, stored as SHA-256 hashes; each can be used once.
CREATE TABLE recovery_codes (
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code_hash)
);

-- Attempts at the second step per user within the current window (brute-force limit).
CREATE TABLE second_factor_attempts (
  user_id TEXT PRIMARY KEY REFERENCES user (id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
