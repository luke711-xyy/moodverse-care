-- Opt-in introductions between two real captains. Existing accounts start in private recommendation mode.
CREATE TABLE IF NOT EXISTS music_copilot_social_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('recommend','confirm','auto')),
  track_id TEXT REFERENCES music_track_catalog(id) ON DELETE SET NULL,
  introduction TEXT NOT NULL DEFAULT '' CHECK(length(introduction) <= 160),
  greeting TEXT NOT NULL DEFAULT '' CHECK(length(greeting) <= 100),
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS music_copilot_introductions (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_revision INTEGER NOT NULL, recipient_revision INTEGER NOT NULL,
  sender_ok INTEGER NOT NULL DEFAULT 0, recipient_ok INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','delivered','closed')),
  created_at TEXT NOT NULL, due_at TEXT NOT NULL, delivered_at TEXT,
  opening TEXT, reply TEXT, CHECK(sender <> recipient)
);
CREATE INDEX IF NOT EXISTS copilot_social_due ON music_copilot_introductions(status,due_at);
CREATE INDEX IF NOT EXISTS copilot_social_sender ON music_copilot_introductions(sender,created_at);
CREATE INDEX IF NOT EXISTS copilot_social_recipient ON music_copilot_introductions(recipient,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS copilot_social_pending_pair ON music_copilot_introductions(min(sender,recipient),max(sender,recipient)) WHERE status='pending';
-- A database uniqueness constraint protects daily delivery even when workers retry concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS copilot_social_daily_sent ON music_copilot_introductions(sender,substr(delivered_at,1,10)) WHERE delivered_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS copilot_social_daily_received ON music_copilot_introductions(recipient,substr(delivered_at,1,10)) WHERE delivered_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS music_copilot_social_pauses (
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('mute','decline')),
  PRIMARY KEY(owner,peer), CHECK(owner <> peer)
);
-- Recommendations use only public shelf data. A separate profile marks which one song can be exchanged.
CREATE VIEW IF NOT EXISTS music_copilot_public_shelves AS
SELECT p.owner_user_id AS user_id,p.id AS planet_id,p.display_name,t.position,t.is_primary,
  c.id AS track_id,c.title,c.artist_id,c.artist_name,c.genres_json
FROM music_planets p
JOIN users u ON u.id=p.owner_user_id AND u.token_hash NOT LIKE 'demo-disabled:%' AND u.id NOT LIKE 'demo:%'
JOIN music_planet_tracks t ON t.planet_id=p.id
JOIN music_track_catalog c ON c.id=t.track_id AND c.is_active=1
WHERE p.visibility='public' AND NOT EXISTS (SELECT 1 FROM music_demo_actors d WHERE d.user_id=p.owner_user_id)
  AND NOT EXISTS (SELECT 1 FROM music_social_preferences f WHERE f.user_id=p.owner_user_id AND f.allow_friend_requests=0);
-- This is the complete allowlist of information available to the two offline agents.
CREATE VIEW IF NOT EXISTS music_copilot_public_pilots AS
SELECT s.mode,s.revision,s.introduction,s.greeting,t.*
FROM music_copilot_social_profiles s JOIN music_copilot_public_shelves t
  ON t.user_id=s.user_id AND t.track_id=s.track_id;
CREATE TRIGGER IF NOT EXISTS copilot_close_consent_change AFTER UPDATE OF revision ON music_copilot_social_profiles
WHEN OLD.revision<>NEW.revision BEGIN
  UPDATE music_copilot_introductions SET status='closed', opening=NULL, reply=NULL WHERE sender=NEW.user_id OR recipient=NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS copilot_close_blocked AFTER INSERT ON music_user_blocks BEGIN
  UPDATE music_copilot_introductions SET status='closed', opening=NULL, reply=NULL
  WHERE (sender=NEW.blocker_user_id AND recipient=NEW.blocked_user_id) OR (sender=NEW.blocked_user_id AND recipient=NEW.blocker_user_id);
END;
CREATE TRIGGER IF NOT EXISTS copilot_close_private AFTER UPDATE OF visibility ON music_planets WHEN NEW.visibility='private' BEGIN
  UPDATE music_copilot_introductions SET status='closed', opening=NULL, reply=NULL WHERE sender=NEW.owner_user_id OR recipient=NEW.owner_user_id;
END;
