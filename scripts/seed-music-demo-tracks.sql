-- Fictional, non-playable songs for the isolated Moodverse Music MVP staging D1.
-- Never apply this file to production or treat these rows as an approved catalog.
INSERT INTO music_track_catalog (
  id, title, artist_id, artist_name, version_label, genres_json, mood_tags_json,
  provider, provider_track_id, official_url, cover_url, duration_seconds,
  is_active, created_at, updated_at
) VALUES
  ('demo:shoreline-afterglow', '潮汐之后', 'demo-artist-mist-route', '雾中航线', '', '["dream pop","ambient"]', '["reflective","calm"]', 'moodverse-demo', 'example-001', '', NULL, 224, 1, datetime('now'), datetime('now')),
  ('demo:orbit-lantern', '轨道灯', 'demo-artist-moon-greenhouse', '月面花房', '', '["electronic","dream pop"]', '["hopeful","curious"]', 'moodverse-demo', 'example-002', '', NULL, 198, 1, datetime('now'), datetime('now')),
  ('demo:coastline', '沿海线', 'demo-artist-glass-sea', '玻璃海', '', '["indie folk","acoustic"]', '["warm","reflective"]', 'moodverse-demo', 'example-003', '', NULL, 211, 1, datetime('now'), datetime('now')),
  ('demo:rain-postcard', '雨的明信片', 'demo-artist-forest-radio', '林间电台', '', '["folk","ambient"]', '["gentle","quiet"]', 'moodverse-demo', 'example-004', '', NULL, 186, 1, datetime('now'), datetime('now')),
  ('demo:city-afterhours', '凌晨三点的街', 'demo-artist-night-bus', '夜班巴士', '', '["synth pop","electronic"]', '["restless","urban"]', 'moodverse-demo', 'example-005', '', NULL, 203, 1, datetime('now'), datetime('now')),
  ('demo:slow-signal', '慢速信号', 'demo-artist-far-shore-letter', '远岸来信', '', '["post-rock","ambient"]', '["calm","longing"]', 'moodverse-demo', 'example-006', '', NULL, 243, 1, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  artist_id = excluded.artist_id,
  artist_name = excluded.artist_name,
  version_label = excluded.version_label,
  genres_json = excluded.genres_json,
  mood_tags_json = excluded.mood_tags_json,
  provider_track_id = excluded.provider_track_id,
  official_url = excluded.official_url,
  cover_url = excluded.cover_url,
  duration_seconds = excluded.duration_seconds,
  is_active = excluded.is_active,
  updated_at = datetime('now')
WHERE music_track_catalog.provider = 'moodverse-demo';
