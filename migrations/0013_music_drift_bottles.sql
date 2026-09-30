-- One daily bottle per sender, with a single active recipient and a durable
-- delivery chain. Comments and likes stay attached to the bottle across hops.
CREATE TABLE IF NOT EXISTS music_drift_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_receiving INTEGER NOT NULL DEFAULT 1 CHECK (allow_receiving IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS music_drift_bottles (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_type TEXT NOT NULL CHECK (topic_type IN ('song', 'info', 'moment')),
  track_id TEXT REFERENCES music_track_catalog(id) ON DELETE RESTRICT,
  moment_id TEXT REFERENCES music_moments(id) ON DELETE SET NULL,
  info_title TEXT,
  info_url TEXT,
  info_summary TEXT,
  message_text TEXT NOT NULL DEFAULT '' CHECK (length(message_text) <= 500),
  created_day_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'unavailable')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (topic_type = 'song' AND track_id IS NOT NULL AND moment_id IS NULL AND info_title IS NULL AND info_url IS NULL AND info_summary IS NULL)
    OR (topic_type = 'info' AND track_id IS NULL AND moment_id IS NULL AND info_title IS NOT NULL AND info_url IS NOT NULL AND info_summary IS NOT NULL)
    OR (topic_type = 'moment' AND track_id IS NULL AND (moment_id IS NOT NULL OR status = 'unavailable') AND info_title IS NULL AND info_url IS NULL AND info_summary IS NULL)
  ),
  UNIQUE (sender_user_id, created_day_utc)
);
CREATE INDEX IF NOT EXISTS music_drift_bottles_sender_created
  ON music_drift_bottles(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS music_drift_bottles_active_created
  ON music_drift_bottles(status, created_at);

CREATE TABLE IF NOT EXISTS music_drift_deliveries (
  id TEXT PRIMARY KEY,
  bottle_id TEXT NOT NULL REFERENCES music_drift_bottles(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hop INTEGER NOT NULL CHECK (hop > 0),
  status TEXT NOT NULL CHECK (status IN ('unread', 'read', 'released', 'expired')),
  delivered_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  opened_at TEXT,
  released_at TEXT,
  UNIQUE (bottle_id, hop)
);
CREATE UNIQUE INDEX IF NOT EXISTS music_drift_deliveries_one_active
  ON music_drift_deliveries(bottle_id) WHERE status IN ('unread', 'read');
CREATE INDEX IF NOT EXISTS music_drift_deliveries_recipient_active
  ON music_drift_deliveries(recipient_user_id, status, delivered_at DESC);
CREATE INDEX IF NOT EXISTS music_drift_deliveries_bottle_history
  ON music_drift_deliveries(bottle_id, hop DESC);

CREATE TABLE IF NOT EXISTS music_drift_comments (
  id TEXT PRIMARY KEY,
  bottle_id TEXT NOT NULL REFERENCES music_drift_bottles(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL REFERENCES music_drift_deliveries(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL CHECK (length(trim(content_text)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  UNIQUE (delivery_id, author_user_id, id)
);
CREATE INDEX IF NOT EXISTS music_drift_comments_bottle_created
  ON music_drift_comments(bottle_id, created_at, id);

CREATE TABLE IF NOT EXISTS music_drift_comment_likes (
  comment_id TEXT NOT NULL REFERENCES music_drift_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);
