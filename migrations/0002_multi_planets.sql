-- Expand only: keep the legacy planets table and its public IDs available for rollback.
-- Apply 0001_planet_billboards.sql first. D1 runs a migration atomically.
ALTER TABLE users ADD COLUMN last_planet_id TEXT;

CREATE TABLE IF NOT EXISTS user_planets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(alias) > 0),
  tagline TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL,
  visual_seed TEXT NOT NULL,
  public_mood TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
  message TEXT NOT NULL DEFAULT '',
  music_url TEXT NOT NULL DEFAULT '',
  doodle_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'mood_theme_public', 'billboard_public')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The legacy public URL was user_id; the owner's procedural terrain used "self".
INSERT OR IGNORE INTO user_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message, music_url, doodle_json, visibility, created_at, updated_at)
SELECT p.user_id, p.user_id, COALESCE(NULLIF(p.alias, ''), '我的星球'), '', p.theme, 'self',
       p.public_mood, p.intensity, p.message, p.music_url, p.doodle_json, p.visibility,
       COALESCE((SELECT MIN(e.created_at) FROM mood_entries e WHERE e.user_id = p.user_id), p.updated_at), p.updated_at
FROM planets p;

-- Recover a planet for old partial writes whose entry was committed before the
-- legacy planet projection was updated.
INSERT OR IGNORE INTO user_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message, music_url, doodle_json, visibility, created_at, updated_at)
SELECT e.user_id, e.user_id, '我的星球', '', e.theme, 'self', e.mood, e.intensity,
       CASE WHEN e.privacy = 'billboard_public' THEN e.public_message ELSE '' END,
       e.music_url, e.doodle_json, e.privacy,
       (SELECT MIN(first_entry.created_at) FROM mood_entries first_entry WHERE first_entry.user_id = e.user_id), e.created_at
FROM mood_entries e
WHERE e.id = (SELECT latest.id FROM mood_entries latest WHERE latest.user_id = e.user_id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1);

INSERT OR IGNORE INTO user_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, visibility, created_at, updated_at)
SELECT b.user_id, b.user_id, '我的星球', '', 'care', 'self', 'calm', 3, 'private', MIN(b.created_at), MAX(b.created_at)
FROM planet_billboards b GROUP BY b.user_id;

UPDATE users SET last_planet_id = user_planets.id
FROM user_planets WHERE users.id = user_planets.user_id AND users.last_planet_id IS NULL;

ALTER TABLE mood_entries ADD COLUMN planet_id TEXT;
ALTER TABLE mood_entries ADD COLUMN billboard_id TEXT;
ALTER TABLE planet_billboards ADD COLUMN planet_id TEXT;
ALTER TABLE replies ADD COLUMN planet_id TEXT;
ALTER TABLE care_cards ADD COLUMN planet_id TEXT;

UPDATE mood_entries SET planet_id = user_id WHERE planet_id IS NULL;
UPDATE mood_entries SET billboard_id = (
  SELECT b.id FROM planet_billboards b
  WHERE b.user_id = mood_entries.user_id AND b.created_at = mood_entries.created_at
  ORDER BY b.id LIMIT 1
) WHERE privacy = 'billboard_public' AND billboard_id IS NULL;
UPDATE planet_billboards SET planet_id = user_id WHERE planet_id IS NULL;
UPDATE replies SET planet_id = planet_user_id WHERE planet_id IS NULL;
UPDATE care_cards SET planet_id = user_id WHERE planet_id IS NULL;

CREATE INDEX IF NOT EXISTS user_planets_owner_created ON user_planets(user_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS user_planets_active_theme ON user_planets(user_id, theme) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS mood_entries_planet_date ON mood_entries(planet_id, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS planet_billboards_planet_created ON planet_billboards(planet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS replies_target_created ON replies(planet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS care_cards_owner_created ON care_cards(user_id, created_at DESC);
DROP INDEX IF EXISTS care_cards_user_day;
CREATE UNIQUE INDEX IF NOT EXISTS care_cards_planet_day ON care_cards(planet_id, substr(created_at, 1, 10));

CREATE TRIGGER IF NOT EXISTS user_planets_limit_insert BEFORE INSERT ON user_planets
WHEN NEW.archived_at IS NULL AND (SELECT count(*) FROM user_planets WHERE user_id = NEW.user_id AND archived_at IS NULL) >= 6
BEGIN SELECT RAISE(ABORT, 'PLANET_LIMIT'); END;
CREATE TRIGGER IF NOT EXISTS user_planets_limit_restore BEFORE UPDATE OF archived_at ON user_planets
WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL
  AND (SELECT count(*) FROM user_planets WHERE user_id = NEW.user_id AND archived_at IS NULL) >= 6
BEGIN SELECT RAISE(ABORT, 'PLANET_LIMIT'); END;
CREATE TRIGGER IF NOT EXISTS user_planets_theme_fixed BEFORE UPDATE OF theme ON user_planets
WHEN NEW.theme != OLD.theme
BEGIN SELECT RAISE(ABORT, 'THEME_IMMUTABLE'); END;
