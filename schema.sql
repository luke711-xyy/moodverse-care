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

-- Verified Cloudflare Access identity for the music MVP. The email is a
-- mutable identity attribute; ownership is keyed by issuer + subject.
CREATE TABLE IF NOT EXISTS music_access_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_issuer TEXT NOT NULL,
  access_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (access_issuer, access_subject)
);
CREATE INDEX IF NOT EXISTS music_access_identities_email
  ON music_access_identities(email);

-- Email OTP authentication for the music MVP. OTPs are stored as HMAC digests;
-- authenticated sessions use a dedicated cookie and are not anonymous legacy sessions.
CREATE TABLE IF NOT EXISTS music_auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  request_ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_nonce TEXT,
  invalidated_at TEXT,
  locked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_auth_challenges_email_created
  ON music_auth_challenges(email, created_at DESC);
CREATE INDEX IF NOT EXISTS music_auth_challenges_ip_created
  ON music_auth_challenges(request_ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS music_email_identities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, email)
);
CREATE INDEX IF NOT EXISTS music_email_identities_user
  ON music_email_identities(user_id);

CREATE TABLE IF NOT EXISTS music_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_auth_sessions_user_expiry
  ON music_auth_sessions(user_id, expires_at DESC);

-- Step-up codes are required before the irreversible self-service delete.
CREATE TABLE IF NOT EXISTS music_account_deletion_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  request_ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  invalidated_at TEXT,
  locked_at TEXT
);
CREATE INDEX IF NOT EXISTS music_account_deletion_codes_user_created
  ON music_account_deletion_codes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS music_account_deletion_codes_ip_created
  ON music_account_deletion_codes(request_ip_hash, created_at DESC);

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

-- Music-first hackathon MVP domain. This mirrors migrations/0007_music_mvp_core.sql.
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

-- Latest public-planet visit per viewer; hidden visits remain private to the visitor.
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

-- Orbit encounter, friendship, and daily roam data. No legacy visit rows are
-- reclassified into new relationship types.
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

CREATE TABLE IF NOT EXISTS music_social_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_friend_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_friend_requests IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS music_friend_requests (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT REFERENCES music_planets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  responded_at TEXT,
  CHECK (requester_user_id <> recipient_user_id),
  UNIQUE (requester_user_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS music_friend_requests_incoming
  ON music_friend_requests(recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS music_friend_requests_outgoing
  ON music_friend_requests(requester_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS music_user_blocks (
  blocker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);
CREATE INDEX IF NOT EXISTS music_user_blocks_blocked
  ON music_user_blocks(blocked_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS music_direct_messages (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL CHECK (length(trim(content_text)) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  read_at TEXT,
  hidden_for_sender INTEGER NOT NULL DEFAULT 0 CHECK (hidden_for_sender IN (0, 1)),
  hidden_for_recipient INTEGER NOT NULL DEFAULT 0 CHECK (hidden_for_recipient IN (0, 1)),
  CHECK (sender_user_id <> recipient_user_id)
);
CREATE INDEX IF NOT EXISTS music_direct_messages_sender
  ON music_direct_messages(sender_user_id, recipient_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS music_direct_messages_recipient
  ON music_direct_messages(recipient_user_id, sender_user_id, created_at DESC, id DESC);

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

-- Minimal user-submitted moderation intake. Target IDs are intentionally not
-- foreign keys so a report remains reviewable after its content is removed.
CREATE TABLE IF NOT EXISTS music_content_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('planet', 'moment', 'drift_bottle', 'drift_comment', 'direct_message')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) BETWEEN 1 AND 128),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'privacy', 'copyright', 'other')),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at TEXT NOT NULL,
  UNIQUE (reporter_user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS music_content_reports_review_queue
  ON music_content_reports(status, created_at ASC);
CREATE INDEX IF NOT EXISTS music_content_reports_reporter_created
  ON music_content_reports(reporter_user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS music_content_reports_daily_limit
BEFORE INSERT ON music_content_reports
WHEN (
  SELECT count(*) FROM music_content_reports
  WHERE reporter_user_id = NEW.reporter_user_id
    AND substr(created_at, 1, 10) = substr(NEW.created_at, 1, 10)
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'MUSIC_REPORT_DAILY_LIMIT');
END;

CREATE TABLE IF NOT EXISTS music_report_reviews (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES music_content_reports(id) ON DELETE CASCADE,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT NOT NULL CHECK (from_status IN ('open', 'reviewing')),
  to_status TEXT NOT NULL CHECK (to_status IN ('reviewing', 'actioned', 'dismissed')),
  created_at TEXT NOT NULL,
  CHECK (from_status <> to_status)
);
CREATE INDEX IF NOT EXISTS music_report_reviews_report_created
  ON music_report_reviews(report_id, created_at DESC, id DESC);
