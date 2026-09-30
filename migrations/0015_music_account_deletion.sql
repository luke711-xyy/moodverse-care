-- Short-lived step-up codes for irreversible self-service account deletion.
CREATE TABLE IF NOT EXISTS music_account_deletion_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  request_ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  invalidated_at TEXT,
  locked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_account_deletion_codes_user_created
  ON music_account_deletion_codes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS music_account_deletion_codes_ip_created
  ON music_account_deletion_codes(request_ip_hash, created_at DESC);
