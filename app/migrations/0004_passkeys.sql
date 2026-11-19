-- Passkeys (WebAuthn) as a second factor. Mirrors src/worker/db/schema.ts.
-- `id` is the credential ID and `public_key` the COSE key, both base64url.
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user ON passkeys (user_id);

-- The WebAuthn challenge a session is answering, one per purpose; used once, short-lived.
-- `recovery_batch` names the recovery codes issued with a first passkey's registration.
CREATE TABLE webauthn_challenges (
  session_id TEXT NOT NULL REFERENCES session (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'authenticate')),
  challenge TEXT NOT NULL,
  recovery_batch TEXT,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, purpose)
);

-- Recovery codes belong to the enrollment that issued them (`batch`). Two sessions may start
-- the first enrollment at once; confirming one keeps only its codes, so the codes the user
-- saved are the ones that work.
ALTER TABLE recovery_codes ADD COLUMN batch TEXT;
ALTER TABLE totp_factors ADD COLUMN recovery_batch TEXT;
