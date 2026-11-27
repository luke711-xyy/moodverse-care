-- One worker owns the two-turn exchange while its lease is live.
CREATE TABLE IF NOT EXISTS music_copilot_social_generation (
  introduction_id TEXT PRIMARY KEY REFERENCES music_copilot_introductions(id) ON DELETE CASCADE,
  lease_id TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  opening_source TEXT CHECK(opening_source IN ('platform','rules')),
  reply_source TEXT CHECK(reply_source IN ('platform','rules'))
);
