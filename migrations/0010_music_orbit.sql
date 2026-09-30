-- Orbit relationship and daily recommendation data. This migration is additive:
-- existing visit rows stay intact and historical visits are not inferred as
-- song encounters or daily recommendations.
CREATE TABLE IF NOT EXISTS music_song_encounters (
  visitor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT NOT NULL REFERENCES music_planets(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES music_track_catalog(id) ON DELETE RESTRICT,
  first_encountered_at TEXT NOT NULL,
  last_encountered_at TEXT NOT NULL,
  PRIMARY KEY (visitor_user_id, planet_id, track_id)
);
CREATE INDEX IF NOT EXISTS music_song_encounters_by_user
  ON music_song_encounters(visitor_user_id, last_encountered_at DESC);

CREATE TABLE IF NOT EXISTS music_friendships (
  user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);
CREATE INDEX IF NOT EXISTS music_friendships_by_user_b
  ON music_friendships(user_b_id, created_at DESC);

CREATE TABLE IF NOT EXISTS music_daily_roam (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_date TEXT NOT NULL,
  planet_id TEXT NOT NULL REFERENCES music_planets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 5),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'similar_genre', 'similar_mood', 'similar_moment', 'semantic_profile', 'random'
  )),
  match_score REAL NOT NULL CHECK (match_score BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, recommendation_date, planet_id),
  UNIQUE (user_id, recommendation_date, position)
);
CREATE INDEX IF NOT EXISTS music_daily_roam_by_day
  ON music_daily_roam(user_id, recommendation_date DESC, position ASC);
