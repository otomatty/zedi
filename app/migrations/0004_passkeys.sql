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
CREATE TABLE webauthn_challenges (
  session_id TEXT NOT NULL REFERENCES session (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'authenticate')),
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, purpose)
);
