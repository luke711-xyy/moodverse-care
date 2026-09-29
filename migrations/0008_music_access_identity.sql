-- Map verified Cloudflare Access identities to durable Moodverse user IDs.
-- Email is stored as a mutable verified attribute; identity ownership is keyed
-- by issuer + subject so email changes do not silently transfer an account.
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
