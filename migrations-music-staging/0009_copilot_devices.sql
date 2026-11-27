-- Desktop credentials are read-only. Store only hashes of single-use codes and access tokens.
CREATE TABLE IF NOT EXISTS music_copilot_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT UNIQUE,
  token_hash TEXT UNIQUE,
  issued_at INTEGER NOT NULL,
  paired_at INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_music_copilot_devices_owner ON music_copilot_devices(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_music_copilot_devices_expiry ON music_copilot_devices(expires_at);
