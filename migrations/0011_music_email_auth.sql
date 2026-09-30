-- Email one-time-code authentication for the music MVP.
-- Challenges store only an HMAC digest. Sessions use their own cookie/table so
-- they never collide with the legacy anonymous Moodverse session.
CREATE TABLE IF NOT EXISTS music_auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  request_ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_nonce TEXT,
  invalidated_at TEXT,
  locked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_auth_challenges_email_created
  ON music_auth_challenges(email, created_at DESC);
CREATE INDEX IF NOT EXISTS music_auth_challenges_ip_created
  ON music_auth_challenges(request_ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS music_email_identities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, email)
);
CREATE INDEX IF NOT EXISTS music_email_identities_user
  ON music_email_identities(user_id);

CREATE TABLE IF NOT EXISTS music_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_auth_sessions_user_expiry
  ON music_auth_sessions(user_id, expires_at DESC);
