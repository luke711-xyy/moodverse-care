-- The music installation owns these tables. All private rows follow the music identity.
CREATE TABLE IF NOT EXISTS music_copilot_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '副驾',
  personality TEXT NOT NULL DEFAULT 'warm',
  proactivity TEXT NOT NULL DEFAULT 'low',
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  voice_enabled INTEGER NOT NULL DEFAULT 0,
  context_version INTEGER NOT NULL DEFAULT 0,
  active_request TEXT,
  active_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS music_copilot_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference','mood')),
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, text)
);
CREATE INDEX IF NOT EXISTS music_copilot_memory_owner ON music_copilot_memories(user_id, updated_at);

CREATE TABLE IF NOT EXISTS music_copilot_turns (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  context_version INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  assistant_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS music_copilot_recent ON music_copilot_turns(user_id, created_at);

-- One atomic INSERT both checks limits and reserves a model call across isolates.
CREATE TABLE IF NOT EXISTS music_copilot_usage (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS music_copilot_global_budget ON music_copilot_usage(kind, at);
CREATE INDEX IF NOT EXISTS music_copilot_user_budget ON music_copilot_usage(user_id, kind, at);
