CREATE TABLE IF NOT EXISTS planet_billboards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'user' CHECK (kind = 'user'),
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  doodle_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS planet_billboards_user_created ON planet_billboards(user_id, created_at DESC);

INSERT OR IGNORE INTO planet_billboards (id, user_id, kind, title, text, doodle_json, created_at)
SELECT id, user_id, 'user', '', public_message, doodle_json, created_at
FROM mood_entries
WHERE privacy = 'billboard_public'
  AND (public_message != '' OR doodle_json != '[]');
