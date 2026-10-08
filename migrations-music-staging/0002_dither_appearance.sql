-- Additive staging-only expansion. Retain the original 3D JSON for rollback.
ALTER TABLE music_planets ADD COLUMN legacy_visual_json TEXT;
ALTER TABLE music_planets ADD COLUMN visual_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE music_planets ADD COLUMN visual_write_token TEXT;
ALTER TABLE music_track_catalog ADD COLUMN visual_features_json TEXT
  CHECK (visual_features_json IS NULL OR json_valid(visual_features_json));

UPDATE music_planets SET legacy_visual_json = visual_json WHERE visual_schema_version < 3;
UPDATE music_ai_tasks SET status = 'failed', error_code = 'DITHER_SUPERSEDED',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE kind = 'planet_composer' AND status IN ('queued', 'running');

-- In-flight workers from the preceding deployment cannot overwrite a v3 save.
CREATE TRIGGER music_reject_legacy_visual_overwrite
BEFORE UPDATE OF visual_json ON music_planets
WHEN OLD.visual_schema_version >= 3 AND NEW.visual_schema_version < 3
BEGIN SELECT RAISE(IGNORE); END;
