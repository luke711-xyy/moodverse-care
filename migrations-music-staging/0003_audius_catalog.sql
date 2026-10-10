-- Additive only. Production and staging share this music DB, not the legacy DB.
CREATE TABLE IF NOT EXISTS music_catalog_queries (
  query_key TEXT PRIMARY KEY,
  track_ids_json TEXT NOT NULL,
  has_more INTEGER NOT NULL DEFAULT 0 CHECK (has_more IN (0,1)),
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS music_galaxy_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  genres_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
