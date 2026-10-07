-- Fictional Moodverse Music staging fixtures. Apply only with
-- `npm run music:staging:seed-demo`; never run against production.
-- The demo:* users cannot authenticate. Per-user fixture actors are attached
-- to every real staging music account so Orbit/social flows are immediately
-- visible without impersonating another account.

INSERT OR IGNORE INTO users (
  id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at
) VALUES
  ('demo:user:mist-route', 'demo-disabled:demo:user:mist-route', 'Asia/Shanghai', '#9bdcff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:moon-greenhouse', 'demo-disabled:demo:user:moon-greenhouse', 'Asia/Shanghai', '#c3b5ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:glass-sea', 'demo-disabled:demo:user:glass-sea', 'Asia/Shanghai', '#75e7df', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:forest-radio', 'demo-disabled:demo:user:forest-radio', 'Asia/Shanghai', '#97e7ad', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:night-bus', 'demo-disabled:demo:user:night-bus', 'Asia/Shanghai', '#ffb7cf', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:far-shore-letter', 'demo-disabled:demo:user:far-shore-letter', 'Asia/Shanghai', '#f4ce8b', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:neon-drifter', 'demo-disabled:demo:user:neon-drifter', 'Asia/Shanghai', '#ff9a74', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:paper-airplane', 'demo-disabled:demo:user:paper-airplane', 'Asia/Shanghai', '#8dc3ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:midnight-tide', 'demo-disabled:demo:user:midnight-tide', 'Asia/Shanghai', '#a5a7ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:waiting-room', 'demo-disabled:demo:user:waiting-room', 'Asia/Shanghai', '#e8c6a0', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:airmail', 'demo-disabled:demo:user:airmail', 'Asia/Shanghai', '#96d7c4', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:blue-planet', 'demo-disabled:demo:user:blue-planet', 'Asia/Shanghai', '#87c8ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO music_planets (
  id, owner_user_id, display_name, tagline, visibility,
  visual_schema_version, visual_json, created_at, updated_at
) VALUES
  ('demo:planet:mist-route', 'demo:user:mist-route', '演示·雾中航线', '把没说完的话，交给潮汐之后。', 'public', 2, '{"schemaVersion":2,"summary":"海雾、慢拍与远岸灯火","palette":{"surface":"#527990","ocean":"#173c5b","accent":"#b4e7ff"},"atmosphere":"mist","motion":"flow","particleDensity":0.56,"terrainFeatures":{"mountainRanges":2,"basins":2,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moon-greenhouse', 'demo:user:moon-greenhouse', '演示·月面花房', '在低重力里，慢慢长出一点绿。', 'public', 2, '{"schemaVersion":2,"summary":"月面温室与柔和的轨道灯","palette":{"surface":"#897da8","ocean":"#303959","accent":"#d0c4ff"},"atmosphere":"starlit","motion":"drift","particleDensity":0.45,"terrainFeatures":{"mountainRanges":3,"basins":1,"canyons":2,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:glass-sea', 'demo:user:glass-sea', '演示·玻璃海', '晴天不必盛大，微光也会抵达。', 'public', 2, '{"schemaVersion":2,"summary":"清澈海面和安静的沿岸","palette":{"surface":"#5e9d9a","ocean":"#14516b","accent":"#9af1e3"},"atmosphere":"clear","motion":"flow","particleDensity":0.4,"terrainFeatures":{"mountainRanges":1,"basins":3,"canyons":1,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:forest-radio', 'demo:user:forest-radio', '演示·林间电台', '把今天的雨声留给明天。', 'public', 2, '{"schemaVersion":2,"summary":"林地、浅湖和温柔的雨","palette":{"surface":"#5f8d6d","ocean":"#173f50","accent":"#b1edbd"},"atmosphere":"mist","motion":"pulse","particleDensity":0.62,"terrainFeatures":{"mountainRanges":2,"basins":3,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:night-bus', 'demo:user:night-bus', '演示·夜班巴士', '城市熄灯以后，故事才刚开始。', 'public', 2, '{"schemaVersion":2,"summary":"深夜霓虹与缓慢移动的光点","palette":{"surface":"#4e567b","ocean":"#171d42","accent":"#ff9cbb"},"atmosphere":"nebula","motion":"drift","particleDensity":0.7,"terrainFeatures":{"mountainRanges":1,"basins":2,"canyons":3,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:far-shore-letter', 'demo:user:far-shore-letter', '演示·远岸来信', '有些回应，正在路上。', 'public', 2, '{"schemaVersion":2,"summary":"远岸灯塔与宽阔的蓝色海湾","palette":{"surface":"#66869a","ocean":"#123b61","accent":"#efcf9a"},"atmosphere":"clear","motion":"flow","particleDensity":0.38,"terrainFeatures":{"mountainRanges":4,"basins":1,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:neon-drifter', 'demo:user:neon-drifter', '演示·霓虹漫游者', '不必赶路，下一站也会发光。', 'public', 2, '{"schemaVersion":2,"summary":"低饱和霓虹和环形城市地貌","palette":{"surface":"#765578","ocean":"#222846","accent":"#ffae85"},"atmosphere":"nebula","motion":"pulse","particleDensity":0.68,"terrainFeatures":{"mountainRanges":1,"basins":1,"canyons":4,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-airplane', 'demo:user:paper-airplane', '演示·纸飞机观察站', '风会把小小的心事带得很远。', 'public', 2, '{"schemaVersion":2,"summary":"轻盈云层和层叠的浅色山脊","palette":{"surface":"#8195aa","ocean":"#24476b","accent":"#c9e7ff"},"atmosphere":"starlit","motion":"drift","particleDensity":0.43,"terrainFeatures":{"mountainRanges":3,"basins":2,"canyons":1,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:midnight-tide', 'demo:user:midnight-tide', '演示·凌晨潮汐', '夜很深，但海面还记得月亮。', 'public', 2, '{"schemaVersion":2,"summary":"午夜海湾和稀疏的星屑","palette":{"surface":"#52638d","ocean":"#111f49","accent":"#a5a7ff"},"atmosphere":"starlit","motion":"flow","particleDensity":0.52,"terrainFeatures":{"mountainRanges":2,"basins":3,"canyons":2,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:waiting-room', 'demo:user:waiting-room', '演示·微光候车室', '每一次等待，都可以有自己的节奏。', 'public', 2, '{"schemaVersion":2,"summary":"暖色灯窗和安静起伏的地平线","palette":{"surface":"#8f7961","ocean":"#283b4a","accent":"#f5d3a0"},"atmosphere":"mist","motion":"still","particleDensity":0.33,"terrainFeatures":{"mountainRanges":2,"basins":2,"canyons":0,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:airmail', 'demo:user:airmail', '演示·空气邮局', '这封信不急着抵达。', 'private', 2, '{"schemaVersion":2,"summary":"被云层包围的小型邮局","palette":{"surface":"#6e9282","ocean":"#1b4551","accent":"#a3e5cb"},"atmosphere":"mist","motion":"drift","particleDensity":0.5,"terrainFeatures":{"mountainRanges":1,"basins":2,"canyons":1,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-planet', 'demo:user:blue-planet', '演示·蓝色行星', '请把声音调小一点，星球正在休息。', 'private', 2, '{"schemaVersion":2,"summary":"安静的深蓝色行星与微弱星光","palette":{"surface":"#486986","ocean":"#10294a","accent":"#87c8ff"},"atmosphere":"starlit","motion":"still","particleDensity":0.28,"terrainFeatures":{"mountainRanges":2,"basins":1,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at) VALUES
  ('demo:planet:mist-route', 'demo:shoreline-afterglow', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:mist-route', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moon-greenhouse', 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moon-greenhouse', 'demo:shoreline-afterglow', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:glass-sea', 'demo:coastline', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:glass-sea', 'demo:shoreline-afterglow', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:forest-radio', 'demo:rain-postcard', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:forest-radio', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:night-bus', 'demo:city-afterhours', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:night-bus', 'demo:orbit-lantern', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:far-shore-letter', 'demo:slow-signal', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:far-shore-letter', 'demo:coastline', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:neon-drifter', 'demo:city-afterhours', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:neon-drifter', 'demo:rain-postcard', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-airplane', 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-airplane', 'demo:rain-postcard', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:midnight-tide', 'demo:shoreline-afterglow', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:midnight-tide', 'demo:city-afterhours', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:waiting-room', 'demo:coastline', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:waiting-room', 'demo:orbit-lantern', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:airmail', 'demo:rain-postcard', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:airmail', 'demo:shoreline-afterglow', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-planet', 'demo:slow-signal', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-planet', 'demo:city-afterhours', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO music_moments (
  id, planet_id, track_id, content_text, photo_url, visibility, published_at, created_at, updated_at
) VALUES
  ('demo:moment:mist-route:1', 'demo:planet:mist-route', 'demo:shoreline-afterglow', '今天走到海边时，风刚好停了一会儿。把这段安静留给晚一点的自己。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 hours')),
  ('demo:moment:mist-route:private', 'demo:planet:mist-route', 'demo:slow-signal', '私人演示记录：这一条不应出现在访客页面或 Galaxy。', NULL, 'private', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 hours')),
  ('demo:moment:moon-greenhouse:1', 'demo:planet:moon-greenhouse', 'demo:orbit-lantern', '给窗边的植物补了水。月色很淡，但新叶看起来很有精神。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-3 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-3 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-3 hours')),
  ('demo:moment:glass-sea:1', 'demo:planet:glass-sea', 'demo:coastline', '今天没有特别大的好消息，不过沿海的云很好看。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-4 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-4 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-4 hours')),
  ('demo:moment:forest-radio:1', 'demo:planet:forest-radio', 'demo:rain-postcard', '窗外下雨，屋里有热茶。先听完这一首，再继续手上的事。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 hours')),
  ('demo:moment:night-bus:1', 'demo:planet:night-bus', 'demo:city-afterhours', '末班车经过熟悉的路口时，忽然想起很多年前的自己。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-6 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-6 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-6 hours')),
  ('demo:moment:far-shore-letter:1', 'demo:planet:far-shore-letter', 'demo:slow-signal', '把几件大事拆成小小的几步。先做眼前这一件，就已经很好。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-7 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-7 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-7 hours')),
  ('demo:moment:neon-drifter:1', 'demo:planet:neon-drifter', 'demo:city-afterhours', '城市的灯牌还亮着，今天的疲惫可以先放在这里。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-8 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-8 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-8 hours')),
  ('demo:moment:paper-airplane:1', 'demo:planet:paper-airplane', 'demo:orbit-lantern', '午休时折了一只纸飞机。它没有飞很远，但我笑了一下。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-9 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-9 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-9 hours')),
  ('demo:moment:midnight-tide:1', 'demo:planet:midnight-tide', 'demo:shoreline-afterglow', '夜里醒来，听见风吹过窗沿。没有急着睡回去，先和自己待一会儿。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-10 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-10 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-10 hours')),
  ('demo:moment:waiting-room:1', 'demo:planet:waiting-room', 'demo:coastline', '候车时把手机收起来几分钟，发现天色正在慢慢变暖。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-11 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-11 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-11 hours')),
  ('demo:moment:airmail:1', 'demo:planet:airmail', 'demo:rain-postcard', '仅演示私密内容：公开浏览、匹配和 Moment 列表都不应泄漏这条记录。', NULL, 'private', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-12 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-12 hours')),
  ('demo:moment:blue-planet:1', 'demo:planet:blue-planet', 'demo:slow-signal', '仅演示私密内容：这颗私有星球不应出现在公开 Galaxy。', NULL, 'private', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-13 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-13 hours'));

-- Two stable demo-to-demo friends and one pending request provide examples in
-- public social APIs without making the fictional identities login-capable.
INSERT OR IGNORE INTO music_friendships (user_a_id, user_b_id, created_at) VALUES
  ('demo:user:glass-sea', 'demo:user:mist-route', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 days')),
  ('demo:user:moon-greenhouse', 'demo:user:paper-airplane', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 days'));
INSERT OR IGNORE INTO music_friend_requests (
  id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at
) VALUES (
  'demo:friend-request:glass-to-night', 'demo:user:glass-sea', 'demo:user:night-bus',
  'demo:planet:glass-sea', 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-20 minutes'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-20 minutes')
);

-- For every real staging account with a music planet, add explicit demo actors
-- and incoming/outgoing activity. This makes personal-only Orbit/DM/inbox UI
-- testable after loading normally; it does not expose or copy real note data.
INSERT OR IGNORE INTO users (id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at)
SELECT 'demo:friend:' || p.owner_user_id, 'demo-disabled:friend:' || p.owner_user_id, 'Asia/Shanghai', '#98dfc6', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO users (id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at)
SELECT 'demo:visitor:' || p.owner_user_id, 'demo-disabled:visitor:' || p.owner_user_id, 'Asia/Shanghai', '#8dc3ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO users (id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at)
SELECT 'demo:request:' || p.owner_user_id, 'demo-disabled:request:' || p.owner_user_id, 'Asia/Shanghai', '#ffb7cf', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO users (id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at)
SELECT 'demo:bottle:' || p.owner_user_id, 'demo-disabled:bottle:' || p.owner_user_id, 'Asia/Shanghai', '#f4ce8b', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_planets (
  id, owner_user_id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
)
SELECT 'demo:planet:friend:' || p.owner_user_id, 'demo:friend:' || p.owner_user_id,
       '演示·轨道好友', '听见同一首歌时，想和你聊聊。', 'public', 2,
       '{"schemaVersion":2,"summary":"好友关系与音乐来信测试","palette":{"surface":"#577d72","ocean":"#163b44","accent":"#98dfc6"},"atmosphere":"starlit","motion":"drift","particleDensity":0.42,"terrainFeatures":{"mountainRanges":2,"basins":2,"canyons":1,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planets (
  id, owner_user_id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
)
SELECT 'demo:planet:visitor:' || p.owner_user_id, 'demo:visitor:' || p.owner_user_id,
       '演示·来访旅人', '路过这里，留下一颗小小的回声。', 'public', 2,
       '{"schemaVersion":2,"summary":"来访记录与隐身访问测试","palette":{"surface":"#526e91","ocean":"#152d52","accent":"#8dc3ff"},"atmosphere":"mist","motion":"flow","particleDensity":0.47,"terrainFeatures":{"mountainRanges":2,"basins":1,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planets (
  id, owner_user_id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
)
SELECT 'demo:planet:request:' || p.owner_user_id, 'demo:request:' || p.owner_user_id,
       '演示·新朋友申请', '如果你愿意，我们可以从这首歌开始。', 'public', 2,
       '{"schemaVersion":2,"summary":"好友请求状态测试","palette":{"surface":"#8b6685","ocean":"#302144","accent":"#ffb7cf"},"atmosphere":"nebula","motion":"pulse","particleDensity":0.52,"terrainFeatures":{"mountainRanges":1,"basins":2,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planets (
  id, owner_user_id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
)
SELECT 'demo:planet:bottle:' || p.owner_user_id, 'demo:bottle:' || p.owner_user_id,
       '演示·漂流瓶来信', '把喜欢的旋律交给下一位旅人。', 'public', 2,
       '{"schemaVersion":2,"summary":"漂流瓶评论、点赞与放流测试","palette":{"surface":"#827050","ocean":"#26374b","accent":"#f4ce8b"},"atmosphere":"clear","motion":"drift","particleDensity":0.35,"terrainFeatures":{"mountainRanges":1,"basins":3,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
SELECT 'demo:planet:friend:' || p.owner_user_id, 'demo:shoreline-afterglow', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
SELECT 'demo:planet:visitor:' || p.owner_user_id, 'demo:city-afterhours', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
SELECT 'demo:planet:request:' || p.owner_user_id, 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
SELECT 'demo:planet:bottle:' || p.owner_user_id, 'demo:coastline', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_friendships (user_a_id, user_b_id, created_at)
SELECT min(p.owner_user_id, 'demo:friend:' || p.owner_user_id), max(p.owner_user_id, 'demo:friend:' || p.owner_user_id), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 hours')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_friend_requests (
  id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at
)
SELECT 'demo:friend-request:incoming:' || p.owner_user_id, 'demo:request:' || p.owner_user_id,
       p.owner_user_id, 'demo:planet:request:' || p.owner_user_id, 'pending',
       strftime('%Y-%m-%dT%H:%M:%fZ','now', '-15 minutes'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-15 minutes')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at, read_at)
SELECT 'demo:dm:incoming:' || p.owner_user_id, 'demo:friend:' || p.owner_user_id, p.owner_user_id,
       '嗨，看到我们都选了《潮汐之后》。你最近也在听雾中航线吗？', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 minutes'), NULL
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at, read_at)
SELECT 'demo:dm:outgoing:' || p.owner_user_id, p.owner_user_id, 'demo:friend:' || p.owner_user_id,
       '最近常在夜里听，像给一天按下慢一点的结束键。', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-4 minutes'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-3 minutes')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_planet_visits (planet_id, visitor_user_id, last_visited_at, is_incognito)
SELECT p.id, 'demo:visitor:' || p.owner_user_id, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-3 minutes'), 0
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_planet_visits (planet_id, visitor_user_id, last_visited_at, is_incognito)
SELECT p.id, 'demo:friend:' || p.owner_user_id, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 minutes'), 1
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';

INSERT OR IGNORE INTO music_planet_visits (planet_id, visitor_user_id, last_visited_at, is_incognito)
SELECT p.id, owner.owner_user_id, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-' || (ROW_NUMBER() OVER (ORDER BY p.id) + 1) || ' hours'), 0
FROM music_planets owner
JOIN music_planets p ON p.owner_user_id IN (
  'demo:user:mist-route', 'demo:user:moon-greenhouse', 'demo:user:glass-sea',
  'demo:user:forest-radio', 'demo:user:night-bus', 'demo:user:far-shore-letter'
)
WHERE owner.owner_user_id NOT LIKE 'demo:%' AND p.visibility = 'public';

INSERT OR IGNORE INTO music_song_encounters (visitor_user_id, planet_id, track_id, first_encountered_at, last_encountered_at)
SELECT owner.owner_user_id, demo_planet.id, owner_track.track_id, strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 hour'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 minute')
FROM music_planets owner
JOIN music_planet_tracks owner_track ON owner_track.planet_id = owner.id
JOIN music_planet_tracks demo_track ON demo_track.track_id = owner_track.track_id
JOIN music_planets demo_planet ON demo_planet.id = demo_track.planet_id AND demo_planet.visibility = 'public'
WHERE owner.owner_user_id NOT LIKE 'demo:%' AND demo_planet.owner_user_id LIKE 'demo:user:%';

INSERT OR IGNORE INTO music_daily_roam (user_id, recommendation_date, planet_id, position, reason_code, match_score, created_at)
SELECT owner.owner_user_id, date('now'), demo_planet.id,
       ROW_NUMBER() OVER (PARTITION BY owner.owner_user_id ORDER BY demo_planet.id) - 1,
       CASE ROW_NUMBER() OVER (PARTITION BY owner.owner_user_id ORDER BY demo_planet.id) % 5
         WHEN 0 THEN 'similar_genre' WHEN 1 THEN 'similar_mood' WHEN 2 THEN 'similar_moment'
         WHEN 3 THEN 'semantic_profile' ELSE 'random' END,
       0.55 + (ROW_NUMBER() OVER (PARTITION BY owner.owner_user_id ORDER BY demo_planet.id) * 0.05), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets owner
JOIN music_planets demo_planet ON demo_planet.owner_user_id IN (
  'demo:user:mist-route', 'demo:user:moon-greenhouse', 'demo:user:glass-sea',
  'demo:user:forest-radio', 'demo:user:night-bus', 'demo:user:far-shore-letter'
)
WHERE owner.owner_user_id NOT LIKE 'demo:%' AND demo_planet.visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM music_daily_roam existing
    WHERE existing.user_id = owner.owner_user_id AND existing.recommendation_date = date('now')
  );

INSERT OR IGNORE INTO music_drift_bottles (
  id, sender_user_id, topic_type, track_id, moment_id, info_title, info_url, info_summary,
  message_text, created_day_utc, status, created_at, updated_at
)
SELECT 'demo:bottle:for:' || p.owner_user_id, 'demo:bottle:' || p.owner_user_id, 'song',
       'demo:shoreline-afterglow', NULL, NULL, NULL, NULL,
       '如果你也需要一个慢一点的晚上，就把这首歌收下吧。', date('now'), 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_drift_deliveries (
  id, bottle_id, recipient_user_id, hop, status, delivered_at, expires_at, opened_at, released_at
)
SELECT 'demo:delivery:for:' || p.owner_user_id, 'demo:bottle:for:' || p.owner_user_id,
       p.owner_user_id, 1, 'unread', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-2 minutes'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '+58 minutes'), NULL, NULL
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_drift_comments (id, bottle_id, delivery_id, author_user_id, content_text, created_at)
SELECT 'demo:bottle-comment:for:' || p.owner_user_id, 'demo:bottle:for:' || p.owner_user_id,
       'demo:delivery:for:' || p.owner_user_id, 'demo:friend:' || p.owner_user_id,
       '收到了，谢谢你把这首歌放进瓶子里。', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-1 minutes')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
INSERT OR IGNORE INTO music_drift_comment_likes (comment_id, user_id, created_at)
SELECT 'demo:bottle-comment:for:' || p.owner_user_id, p.owner_user_id, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM music_planets p WHERE p.owner_user_id NOT LIKE 'demo:%';
