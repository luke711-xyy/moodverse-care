-- Authenticated friendship, account-level request preference, user blocks,
-- and private text conversations for the music-first MVP.
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
