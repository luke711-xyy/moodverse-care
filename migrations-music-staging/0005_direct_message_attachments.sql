-- Additive extension: existing text messages and old clients remain valid.
CREATE TABLE IF NOT EXISTS music_direct_message_attachments (
  message_id TEXT PRIMARY KEY REFERENCES music_direct_messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('song', 'photo')),
  track_id TEXT REFERENCES music_track_catalog(id) ON DELETE SET NULL,
  photo_key TEXT UNIQUE,
  content_type TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size < 10485760))
);
