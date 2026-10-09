-- First-party MP3 supplied by the project owner. Shared music D1 only.
INSERT INTO music_track_catalog
  (id,title,artist_id,artist_name,version_label,genres_json,mood_tags_json,provider,provider_track_id,official_url,cover_url,duration_seconds,is_active,visual_features_json,created_at,updated_at)
VALUES ('local:the-mountain-cosmos','Cosmos','the-mountain','The_mountain','','["Ambient","Electronic"]','["宇宙","舒缓"]','user-supplied','cosmos-587577','',NULL,88,1,'{"source":"curated","tempoBpm":105.1,"energy":0.55,"hardness":0.25,"acousticness":0.2}',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist_id=excluded.artist_id,artist_name=excluded.artist_name,genres_json=excluded.genres_json,mood_tags_json=excluded.mood_tags_json,visual_features_json=excluded.visual_features_json,duration_seconds=excluded.duration_seconds,is_active=1;

-- Only system-created demo planets. Real owners' manually selected tracks,
-- Moments and visual overrides remain untouched. Existing songs are retained.
INSERT OR IGNORE INTO music_planet_tracks (planet_id,track_id,position,is_primary,selected_at)
SELECT p.id,'local:the-mountain-cosmos',
  (SELECT min(slot) FROM (SELECT 0 AS slot UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4)
   WHERE NOT EXISTS (SELECT 1 FROM music_planet_tracks t WHERE t.planet_id=p.id AND t.position=slot)),
  0,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p
WHERE p.id LIKE 'demo:planet:%' AND p.owner_user_id LIKE 'demo:%'
  AND (SELECT count(*) FROM music_planet_tracks t WHERE t.planet_id=p.id)<5;

UPDATE music_planet_tracks SET is_primary=0
WHERE planet_id IN (SELECT p.id FROM music_planets p JOIN music_planet_tracks t ON t.planet_id=p.id AND t.track_id='local:the-mountain-cosmos'
  WHERE p.id LIKE 'demo:planet:%' AND p.owner_user_id LIKE 'demo:%') AND is_primary=1 AND track_id<>'local:the-mountain-cosmos';
UPDATE music_planet_tracks SET is_primary=1
WHERE track_id='local:the-mountain-cosmos' AND planet_id IN
  (SELECT id FROM music_planets WHERE id LIKE 'demo:planet:%' AND owner_user_id LIKE 'demo:%');
