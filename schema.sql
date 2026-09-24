-- Moodverse MVP schema. Private notes never appear in public projection queries.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  last_planet_id TEXT,
  star_color TEXT NOT NULL DEFAULT '#ffd166',
  star_texture_webp TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Topic follows are user preferences, independent from the themes of owned planets.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  focused_themes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL DEFAULT '我的星球',
  theme TEXT NOT NULL,
  public_mood TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
  message TEXT NOT NULL DEFAULT '',
  music_url TEXT NOT NULL DEFAULT '',
  doodle_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'mood_theme_public', 'billboard_public')),
  updated_at TEXT NOT NULL
);

-- Multi-planet records live beside the legacy one-planet table. Keeping the old
-- table makes the production migration additive and preserves rollback data.
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
CREATE INDEX IF NOT EXISTS user_planets_owner_created ON user_planets(user_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS user_planets_active_theme ON user_planets(user_id, theme) WHERE archived_at IS NULL;
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

CREATE TABLE IF NOT EXISTS mood_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT,
  billboard_id TEXT,
  date TEXT NOT NULL,
  theme TEXT NOT NULL,
  mood TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  triggers_json TEXT NOT NULL DEFAULT '[]',
  private_note TEXT NOT NULL DEFAULT '',
  public_message TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL CHECK (privacy IN ('private', 'mood_theme_public', 'billboard_public')),
  music_url TEXT NOT NULL DEFAULT '',
  doodle_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mood_entries_user_date ON mood_entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS mood_entries_planet_date ON mood_entries(planet_id, date DESC, created_at DESC);
CREATE TRIGGER IF NOT EXISTS mood_entries_one_per_planet_day
BEFORE INSERT ON mood_entries
WHEN NEW.planet_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM mood_entries existing
  WHERE existing.planet_id = NEW.planet_id AND existing.date = NEW.date
)
BEGIN
  SELECT RAISE(ABORT, 'DAILY_ENTRY_EXISTS');
END;

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  planet_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  doodle_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'reported')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS replies_planet_created ON replies(planet_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS replies_target_created ON replies(planet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS care_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT,
  record_date TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS care_cards_planet_record_day ON care_cards(planet_id, record_date);
CREATE INDEX IF NOT EXISTS care_cards_owner_created ON care_cards(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS planet_billboards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT,
  kind TEXT NOT NULL DEFAULT 'user' CHECK (kind = 'user'),
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  doodle_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS planet_billboards_user_created ON planet_billboards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS planet_billboards_planet_created ON planet_billboards(planet_id, created_at DESC);
