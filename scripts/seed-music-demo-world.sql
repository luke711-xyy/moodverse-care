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
  ('demo:user:blue-planet', 'demo-disabled:demo:user:blue-planet', 'Asia/Shanghai', '#87c8ff', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:quiet-comet', 'demo-disabled:demo:user:quiet-comet', 'Asia/Shanghai', '#9eb9ed', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:blue-hour-library', 'demo-disabled:demo:user:blue-hour-library', 'Asia/Shanghai', '#8fa9d5', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:river-station', 'demo-disabled:demo:user:river-station', 'Asia/Shanghai', '#70c7d2', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:moss-orbit', 'demo-disabled:demo:user:moss-orbit', 'Asia/Shanghai', '#9ab58a', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:saltwind-archive', 'demo-disabled:demo:user:saltwind-archive', 'Asia/Shanghai', '#d8b78b', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:cloud-courtyard', 'demo-disabled:demo:user:cloud-courtyard', 'Asia/Shanghai', '#b3d2e5', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:ember-coast', 'demo-disabled:demo:user:ember-coast', 'Asia/Shanghai', '#df927e', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:distant-window', 'demo-disabled:demo:user:distant-window', 'Asia/Shanghai', '#a4c7c2', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:tide-cinema', 'demo-disabled:demo:user:tide-cinema', 'Asia/Shanghai', '#938ccb', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:small-orbit', 'demo-disabled:demo:user:small-orbit', 'Asia/Shanghai', '#d2a5d8', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:snowfield-echo', 'demo-disabled:demo:user:snowfield-echo', 'Asia/Shanghai', '#b6d3e7', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:paper-moon', 'demo-disabled:demo:user:paper-moon', 'Asia/Shanghai', '#c5a3bb', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:long-way-home', 'demo-disabled:demo:user:long-way-home', 'Asia/Shanghai', '#c3b39a', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:user:after-rain-radio', 'demo-disabled:demo:user:after-rain-radio', 'Asia/Shanghai', '#86c8b9', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

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
  ('demo:planet:quiet-comet', 'demo:user:quiet-comet', '演示·静默彗尾', '不必把所有答案都带走。', 'public', 2, '{"schemaVersion":2,"summary":"远日点上的安静蓝色星球","palette":{"surface":"#566e94","ocean":"#142944","accent":"#a9c4ff"},"atmosphere":"starlit","motion":"drift","particleDensity":0.31,"terrainFeatures":{"mountainRanges":3,"basins":2,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-hour-library', 'demo:user:blue-hour-library', '演示·蓝时书库', '天色转蓝时，适合读一小段。', 'public', 2, '{"schemaVersion":2,"summary":"薄暮色带与层叠的书页般地貌","palette":{"surface":"#647caa","ocean":"#1a3159","accent":"#b8c9fa"},"atmosphere":"nebula","motion":"still","particleDensity":0.39,"terrainFeatures":{"mountainRanges":2,"basins":3,"canyons":1,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:river-station', 'demo:user:river-station', '演示·河流中转站', '每条河都知道怎么继续往前。', 'public', 2, '{"schemaVersion":2,"summary":"青蓝河谷与宽阔浅海","palette":{"surface":"#659f9b","ocean":"#164866","accent":"#9ce8e0"},"atmosphere":"clear","motion":"flow","particleDensity":0.58,"terrainFeatures":{"mountainRanges":3,"basins":1,"canyons":3,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moss-orbit', 'demo:user:moss-orbit', '演示·苔藓轨道', '慢慢长，也是一种抵达。', 'public', 2, '{"schemaVersion":2,"summary":"温润苔原、林地和小湖","palette":{"surface":"#688766","ocean":"#183e47","accent":"#b6df9e"},"atmosphere":"mist","motion":"pulse","particleDensity":0.63,"terrainFeatures":{"mountainRanges":2,"basins":3,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:saltwind-archive', 'demo:user:saltwind-archive', '演示·盐风档案', '把旧日的光，收进今天的抽屉。', 'public', 2, '{"schemaVersion":2,"summary":"浅色盐地、风蚀峡谷与海湾","palette":{"surface":"#a78b6b","ocean":"#23465b","accent":"#ead1a4"},"atmosphere":"clear","motion":"flow","particleDensity":0.36,"terrainFeatures":{"mountainRanges":1,"basins":4,"canyons":2,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:cloud-courtyard', 'demo:user:cloud-courtyard', '演示·云中庭', '给心事留一扇透气的窗。', 'public', 2, '{"schemaVersion":2,"summary":"云层之间的浅色环形高地","palette":{"surface":"#849eae","ocean":"#28485f","accent":"#c7e8f6"},"atmosphere":"mist","motion":"drift","particleDensity":0.51,"terrainFeatures":{"mountainRanges":2,"basins":2,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:ember-coast', 'demo:user:ember-coast', '演示·余烬海岸', '热闹散场之后，也有微光。', 'public', 2, '{"schemaVersion":2,"summary":"暖色岩岸、暗海与低亮灯点","palette":{"surface":"#a66354","ocean":"#2a223c","accent":"#f2a77f"},"atmosphere":"nebula","motion":"pulse","particleDensity":0.48,"terrainFeatures":{"mountainRanges":2,"basins":1,"canyons":3,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:distant-window', 'demo:user:distant-window', '演示·远窗', '远处的灯亮着，就不算太晚。', 'public', 2, '{"schemaVersion":2,"summary":"稀疏灯火与柔和的沿岸地貌","palette":{"surface":"#637e83","ocean":"#193b50","accent":"#a4d8d1"},"atmosphere":"starlit","motion":"drift","particleDensity":0.34,"terrainFeatures":{"mountainRanges":4,"basins":2,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:tide-cinema', 'demo:user:tide-cinema', '演示·潮汐影院', '今天的故事，可以慢一点结束。', 'public', 2, '{"schemaVersion":2,"summary":"靛色海面和弧形潮汐盆地","palette":{"surface":"#625e91","ocean":"#172d50","accent":"#b3aaf2"},"atmosphere":"nebula","motion":"flow","particleDensity":0.55,"terrainFeatures":{"mountainRanges":1,"basins":3,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:small-orbit', 'demo:user:small-orbit', '演示·小小轨道', '很小的一步，也算在路上。', 'public', 2, '{"schemaVersion":2,"summary":"粉紫色低重力小行星与浅湖","palette":{"surface":"#98769b","ocean":"#282745","accent":"#e0b7e8"},"atmosphere":"starlit","motion":"pulse","particleDensity":0.44,"terrainFeatures":{"mountainRanges":2,"basins":2,"canyons":2,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:snowfield-echo', 'demo:user:snowfield-echo', '演示·雪原回声', '安静不是空白，是另一种声音。', 'public', 2, '{"schemaVersion":2,"summary":"冰蓝雪线和深色峡谷湖","palette":{"surface":"#718da5","ocean":"#1a304b","accent":"#c2e5fa"},"atmosphere":"starlit","motion":"still","particleDensity":0.37,"terrainFeatures":{"mountainRanges":4,"basins":2,"canyons":3,"escarpments":2}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-moon', 'demo:user:paper-moon', '演示·纸月亮', '把今晚折好，明天再打开。', 'public', 2, '{"schemaVersion":2,"summary":"柔粉月色与折页般的环形山","palette":{"surface":"#987e91","ocean":"#312a48","accent":"#e8c4dc"},"atmosphere":"mist","motion":"drift","particleDensity":0.42,"terrainFeatures":{"mountainRanges":2,"basins":4,"canyons":1,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:long-way-home', 'demo:user:long-way-home', '演示·漫长归途', '一步一步，也能走回熟悉的地方。', 'public', 2, '{"schemaVersion":2,"summary":"暖灰山脉、河谷与归途灯标","palette":{"surface":"#8e806b","ocean":"#243b4b","accent":"#d8c39f"},"atmosphere":"clear","motion":"flow","particleDensity":0.49,"terrainFeatures":{"mountainRanges":3,"basins":2,"canyons":2,"escarpments":1}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:after-rain-radio', 'demo:user:after-rain-radio', '演示·雨后收音机', '雨停了，声音还留在窗边。', 'public', 2, '{"schemaVersion":2,"summary":"雨后森林、云隙光与低地水洼","palette":{"surface":"#568477","ocean":"#153d4d","accent":"#9fe1c9"},"atmosphere":"mist","motion":"pulse","particleDensity":0.6,"terrainFeatures":{"mountainRanges":2,"basins":3,"canyons":2,"escarpments":0}}', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
  ('demo:planet:quiet-comet', 'demo:slow-signal', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:quiet-comet', 'demo:rain-postcard', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-hour-library', 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:blue-hour-library', 'demo:shoreline-afterglow', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:river-station', 'demo:coastline', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:river-station', 'demo:rain-postcard', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moss-orbit', 'demo:rain-postcard', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:moss-orbit', 'demo:coastline', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:saltwind-archive', 'demo:coastline', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:saltwind-archive', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:cloud-courtyard', 'demo:shoreline-afterglow', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:cloud-courtyard', 'demo:orbit-lantern', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:ember-coast', 'demo:city-afterhours', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:ember-coast', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:distant-window', 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:distant-window', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:tide-cinema', 'demo:shoreline-afterglow', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:tide-cinema', 'demo:city-afterhours', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:small-orbit', 'demo:orbit-lantern', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:small-orbit', 'demo:rain-postcard', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:snowfield-echo', 'demo:slow-signal', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:snowfield-echo', 'demo:coastline', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-moon', 'demo:city-afterhours', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:paper-moon', 'demo:shoreline-afterglow', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:long-way-home', 'demo:rain-postcard', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:long-way-home', 'demo:slow-signal', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:after-rain-radio', 'demo:rain-postcard', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('demo:planet:after-rain-radio', 'demo:orbit-lantern', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
  ('demo:moment:quiet-comet:1', 'demo:planet:quiet-comet', 'demo:slow-signal', '把没来得及回答的问题先放一放，沿着星光走一段。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-14 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-14 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-14 hours')),
  ('demo:moment:blue-hour-library:1', 'demo:planet:blue-hour-library', 'demo:orbit-lantern', '今天读到一行喜欢的话，想把它留在蓝色的傍晚。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-15 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-15 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-15 hours')),
  ('demo:moment:river-station:1', 'demo:planet:river-station', 'demo:coastline', '沿着河走了很久，最后发现自己已经没有那么着急了。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-16 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-16 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-16 hours')),
  ('demo:moment:moss-orbit:1', 'demo:planet:moss-orbit', 'demo:rain-postcard', '给阳台的植物浇水时，发现新芽比昨天高了一点。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-17 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-17 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-17 hours')),
  ('demo:moment:saltwind-archive:1', 'demo:planet:saltwind-archive', 'demo:coastline', '把一件旧事写下来，它好像就没有那么重了。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-18 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-18 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-18 hours')),
  ('demo:moment:cloud-courtyard:1', 'demo:planet:cloud-courtyard', 'demo:shoreline-afterglow', '下午开了窗，云很低，房间里终于有了风。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-19 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-19 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-19 hours')),
  ('demo:moment:ember-coast:1', 'demo:planet:ember-coast', 'demo:city-afterhours', '忙碌的一天结束了，留一点余温给自己。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-20 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-20 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-20 hours')),
  ('demo:moment:distant-window:1', 'demo:planet:distant-window', 'demo:orbit-lantern', '抬头时看到远处亮着一扇窗，心里也安定了一些。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-21 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-21 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-21 hours')),
  ('demo:moment:tide-cinema:1', 'demo:planet:tide-cinema', 'demo:shoreline-afterglow', '今天不想赶着给故事一个结尾，就让潮水多响一会儿。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-22 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-22 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-22 hours')),
  ('demo:moment:small-orbit:1', 'demo:planet:small-orbit', 'demo:orbit-lantern', '完成了一件很小的事，也值得绕着它庆祝一圈。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-23 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-23 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-23 hours')),
  ('demo:moment:snowfield-echo:1', 'demo:planet:snowfield-echo', 'demo:slow-signal', '雪落下来以后，很多声音都变得温柔了。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-24 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-24 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-24 hours')),
  ('demo:moment:paper-moon:1', 'demo:planet:paper-moon', 'demo:city-afterhours', '把今天折成一页，先夹在书里，明天再读。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-25 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-25 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-25 hours')),
  ('demo:moment:long-way-home:1', 'demo:planet:long-way-home', 'demo:rain-postcard', '回家的路比平时长一点，但也多看见了几盏灯。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-26 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-26 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-26 hours')),
  ('demo:moment:after-rain-radio:1', 'demo:planet:after-rain-radio', 'demo:rain-postcard', '雨停以后，收音机里刚好放到熟悉的副歌。', NULL, 'public', strftime('%Y-%m-%dT%H:%M:%fZ','now', '-27 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-27 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now', '-27 hours')),
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
