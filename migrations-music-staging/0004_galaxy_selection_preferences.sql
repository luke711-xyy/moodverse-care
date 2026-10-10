-- Additive and backward-compatible: legacy genre preferences stay untouched.
CREATE TABLE IF NOT EXISTS music_galaxy_selection_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_by TEXT NOT NULL CHECK (group_by IN ('artist','song')),
  selection_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(selection_json) AND json_type(selection_json)='array'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, group_by)
);
