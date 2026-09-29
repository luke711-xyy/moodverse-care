-- Add the music-first MVP domain beside the legacy Moodverse schema.
-- Keeping the old tables untouched makes rollout additive and reversible.

CREATE TABLE IF NOT EXISTS music_track_catalog (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT '',
  genres_json TEXT NOT NULL DEFAULT '[]',
  mood_tags_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  provider_track_id TEXT NOT NULL,
  official_url TEXT NOT NULL,
  cover_url TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_track_id)
);
CREATE INDEX IF NOT EXISTS music_track_catalog_active_title
  ON music_track_catalog(is_active, title, artist_name);
CREATE INDEX IF NOT EXISTS music_track_catalog_artist
  ON music_track_catalog(artist_id, is_active);

CREATE TABLE IF NOT EXISTS music_planets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  tagline TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  visual_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (visual_schema_version > 0),
  visual_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS music_planets_public_updated
  ON music_planets(visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS music_planet_tracks (
  planet_id TEXT NOT NULL REFERENCES music_planets(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES music_track_catalog(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  selected_at TEXT NOT NULL,
  PRIMARY KEY (planet_id, track_id),
  UNIQUE (planet_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS music_planet_tracks_single_primary
  ON music_planet_tracks(planet_id) WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS music_planet_tracks_track
  ON music_planet_tracks(track_id, planet_id);
CREATE TRIGGER IF NOT EXISTS music_planet_tracks_limit_insert
BEFORE INSERT ON music_planet_tracks
WHEN (SELECT count(*) FROM music_planet_tracks WHERE planet_id = NEW.planet_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'MUSIC_TRACK_LIMIT');
END;

CREATE TABLE IF NOT EXISTS music_moments (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES music_planets(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES music_track_catalog(id) ON DELETE RESTRICT,
  content_text TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS music_moments_planet_created
  ON music_moments(planet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS music_moments_public_track
  ON music_moments(track_id, visibility, published_at DESC);

CREATE TABLE IF NOT EXISTS music_ai_tasks (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT REFERENCES music_planets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'planet_composer', 'song_portal_rank', 'discovery_embedding', 'bottle_embedding'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  input_hash TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS music_ai_tasks_requester_created
  ON music_ai_tasks(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS music_ai_tasks_status_created
  ON music_ai_tasks(status, created_at);
