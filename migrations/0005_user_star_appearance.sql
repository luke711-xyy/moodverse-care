-- Store the personal-system star's appearance without touching existing records.
ALTER TABLE users ADD COLUMN star_color TEXT NOT NULL DEFAULT '#ffd166';
ALTER TABLE users ADD COLUMN star_texture_webp TEXT NOT NULL DEFAULT '';
