-- Store only each visitor's latest state per public planet. An incognito visit
-- remains in the visitor's own history but is filtered from the owner's list.
CREATE TABLE IF NOT EXISTS music_planet_visits (
  planet_id TEXT NOT NULL REFERENCES music_planets(id) ON DELETE CASCADE,
  visitor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_visited_at TEXT NOT NULL,
  is_incognito INTEGER NOT NULL DEFAULT 0 CHECK (is_incognito IN (0, 1)),
  PRIMARY KEY (planet_id, visitor_user_id)
);
CREATE INDEX IF NOT EXISTS music_planet_visits_by_visitor
  ON music_planet_visits(visitor_user_id, last_visited_at DESC);
CREATE INDEX IF NOT EXISTS music_planet_visits_visible_by_planet
  ON music_planet_visits(planet_id, last_visited_at DESC) WHERE is_incognito = 0;
