-- Expand only: keep focused topics separate from the user's planet themes.
-- Existing users receive the application default (the original six themes) at read time.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  focused_themes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
