-- Incremental change after the staging schema.sql baseline.
-- Virtual companions are distinct from accepted social friendships.
CREATE TABLE IF NOT EXISTS music_friend_satellites (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_slot INTEGER NOT NULL CHECK (friend_slot BETWEEN 0 AND 2),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 40),
  tagline TEXT NOT NULL DEFAULT '' CHECK (length(tagline) <= 120),
  color TEXT NOT NULL,
  visual_seed TEXT NOT NULL,
  orbit_radius REAL NOT NULL CHECK (orbit_radius BETWEEN 0.18 AND 0.5),
  orbit_phase REAL NOT NULL CHECK (orbit_phase BETWEEN 0 AND 6.2832),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (owner_user_id, friend_slot)
);
CREATE INDEX IF NOT EXISTS music_friend_satellites_by_owner
  ON music_friend_satellites(owner_user_id, deleted_at, friend_slot);
