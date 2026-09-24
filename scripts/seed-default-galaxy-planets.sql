-- Adds eight non-loginable sample owners with one public planet per default theme.
-- Together with the original two sample owners, every default galaxy has at least
-- ten complete production-format planet assets. All inserts are safe to re-run.

WITH owners(owner_no, user_id, flavor, star_color, owner_note) AS (VALUES
  (3, 'mv-demo-account-03', '雾灯', '#89f4ce', '慢一点也能走到想去的地方。'),
  (4, 'mv-demo-account-04', '纸船', '#c39cff', '把喜欢的小事留给未来的自己。'),
  (5, 'mv-demo-account-05', '远山', '#70c8ff', '今天能做到的已经很好。'),
  (6, 'mv-demo-account-06', '蓝莓', '#ff76b6', '愿意重新开始本身就很勇敢。'),
  (7, 'mv-demo-account-07', '拾光', '#ffd36b', '先记录下来，再决定下一步。'),
  (8, 'mv-demo-account-08', '晚风', '#ffb870', '给心情一点时间，不必赶路。'),
  (9, 'mv-demo-account-09', '雨林', '#89f4ce', '我正在练习对自己宽松一点。'),
  (10, 'mv-demo-account-10', '星屿', '#70c8ff', '微小的进展也值得认真记下。')
)
INSERT OR IGNORE INTO users
  (id, token_hash, timezone, last_planet_id, star_color, star_texture_webp, created_at, updated_at)
SELECT user_id, lower(hex(randomblob(32))), 'Asia/Shanghai', NULL, star_color, '', datetime('now'), datetime('now')
FROM owners;

WITH owners(user_id) AS (VALUES
  ('mv-demo-account-03'), ('mv-demo-account-04'), ('mv-demo-account-05'), ('mv-demo-account-06'),
  ('mv-demo-account-07'), ('mv-demo-account-08'), ('mv-demo-account-09'), ('mv-demo-account-10')
)
INSERT OR IGNORE INTO user_preferences (user_id, focused_themes_json, updated_at)
SELECT user_id, '["study","career","court","lens","create","care"]', datetime('now')
FROM owners;

WITH
owners(owner_no, user_id, flavor, owner_note) AS (VALUES
  (3, 'mv-demo-account-03', '雾灯', '慢一点也能走到想去的地方。'),
  (4, 'mv-demo-account-04', '纸船', '把喜欢的小事留给未来的自己。'),
  (5, 'mv-demo-account-05', '远山', '今天能做到的已经很好。'),
  (6, 'mv-demo-account-06', '蓝莓', '愿意重新开始本身就很勇敢。'),
  (7, 'mv-demo-account-07', '拾光', '先记录下来，再决定下一步。'),
  (8, 'mv-demo-account-08', '晚风', '给心情一点时间，不必赶路。'),
  (9, 'mv-demo-account-09', '雨林', '我正在练习对自己宽松一点。'),
  (10, 'mv-demo-account-10', '星屿', '微小的进展也值得认真记下。')
),
themes(theme, theme_index, label, color, tagline, activity, trigger_label) AS (VALUES
  ('study', 0, '考研', '#70c8ff', '把注意力放回下一小步。', '读完一章，把暂时卡住的地方先做了记号。', '复习节奏'),
  ('career', 1, '考公', '#ffb870', '在不确定里整理秩序。', '整理了一些岗位信息，也给计划留了余地。', '备考安排'),
  ('court', 2, '球类运动', '#ff76b6', '让身体先替心情动起来。', '到球场活动了一会儿，顺着身体的节奏休息。', '身体状态'),
  ('lens', 3, '摄影', '#89f4ce', '把今天的光留在镜头里。', '沿着光线走了一段，留下几张喜欢的照片。', '光线与观察'),
  ('create', 4, '艺术创作', '#c39cff', '让想法拥有可以停靠的地方。', '把一个小小的想法，做成了可以触摸的样子。', '创作进度'),
  ('care', 5, '自我成长', '#ffd36b', '留一点时间给正在努力的你。', '认真吃饭，也记得给自己留一点松弛。', '休息与照顾')
),
moods(mood_index, mood, intensity) AS (VALUES
  (0, 'joy', 4), (1, 'hope', 3), (2, 'calm', 2), (3, 'sad', 3), (4, 'anxious', 4),
  (5, 'tired', 3), (6, 'irritable', 3), (7, 'anger', 4), (8, 'lonely', 3), (9, 'hurt', 3),
  (10, 'confused', 3), (11, 'relieved', 3), (12, 'grateful', 4), (13, 'content', 3),
  (14, 'numb', 2), (15, 'fear', 4), (16, 'proud', 4), (17, 'unnamed', 2)
)
INSERT OR IGNORE INTO user_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message, music_url, doodle_json, visibility, archived_at, created_at, updated_at)
SELECT
  'mv-demo-' || printf('%02d', owners.owner_no) || '-' || themes.theme,
  owners.user_id,
  '示例·' || themes.label || '·' || owners.flavor,
  themes.tagline,
  themes.theme,
  'mv-default-visual-' || printf('%02d', owners.owner_no) || '-' || themes.theme,
  moods.mood,
  moods.intensity,
  '最近在' || themes.label || '：' || themes.activity || ' ' || owners.owner_note,
  '',
  json_array(json_object(
    'points', json_array(
      json_array(0.18, 0.30 + owners.owner_no * 0.04),
      json_array(0.34, 0.66 - owners.owner_no * 0.02),
      json_array(0.49, 0.39 + owners.owner_no * 0.02),
      json_array(0.65, 0.63),
      json_array(0.82, 0.34 + owners.owner_no * 0.015)
    ),
    'color', themes.color,
    'width', 0.014,
    'coordinateSpace', 'normalized'
  )),
  'billboard_public', NULL, datetime('now', '-6 days'), datetime('now')
FROM owners
CROSS JOIN themes
JOIN moods ON moods.mood_index = (owners.owner_no * 5 + themes.theme_index * 3) % 18
WHERE NOT EXISTS (
  SELECT 1 FROM user_planets existing
  WHERE existing.id = 'mv-demo-' || printf('%02d', owners.owner_no) || '-' || themes.theme
     OR (existing.user_id = owners.user_id AND existing.theme = themes.theme)
);

WITH RECURSIVE
owners(owner_no, user_id) AS (VALUES
  (3, 'mv-demo-account-03'), (4, 'mv-demo-account-04'), (5, 'mv-demo-account-05'), (6, 'mv-demo-account-06'),
  (7, 'mv-demo-account-07'), (8, 'mv-demo-account-08'), (9, 'mv-demo-account-09'), (10, 'mv-demo-account-10')
),
themes(theme, theme_index, trigger_label) AS (VALUES
  ('study', 0, '复习节奏'), ('career', 1, '备考安排'), ('court', 2, '身体状态'),
  ('lens', 3, '光线与观察'), ('create', 4, '创作进度'), ('care', 5, '休息与照顾')
),
moods(mood_index, mood, intensity) AS (VALUES
  (0, 'joy', 4), (1, 'hope', 3), (2, 'calm', 2), (3, 'sad', 3), (4, 'anxious', 4),
  (5, 'tired', 3), (6, 'irritable', 3), (7, 'anger', 4), (8, 'lonely', 3), (9, 'hurt', 3),
  (10, 'confused', 3), (11, 'relieved', 3), (12, 'grateful', 4), (13, 'content', 3),
  (14, 'numb', 2), (15, 'fear', 4), (16, 'proud', 4), (17, 'unnamed', 2)
),
days(days_ago) AS (
  SELECT 0 UNION ALL SELECT days_ago + 1 FROM days WHERE days_ago < 6
)
INSERT OR IGNORE INTO mood_entries
  (id, user_id, planet_id, billboard_id, date, theme, mood, intensity, triggers_json, private_note, public_message, privacy, music_url, doodle_json, created_at)
SELECT
  planet.id || '-day-' || days.days_ago,
  planet.user_id,
  planet.id,
  CASE WHEN days.days_ago = 0 THEN planet.id || '-billboard' ELSE NULL END,
  date('now', '+8 hours', '-' || days.days_ago || ' days'),
  planet.theme,
  moods.mood,
  moods.intensity,
  json_array(themes.trigger_label),
  '',
  CASE WHEN days.days_ago = 0 THEN planet.message ELSE '' END,
  CASE WHEN days.days_ago = 0 THEN 'billboard_public' ELSE 'mood_theme_public' END,
  '',
  CASE WHEN days.days_ago = 0 THEN planet.doodle_json ELSE '[]' END,
  datetime('now', '-' || days.days_ago || ' days')
FROM user_planets planet
JOIN owners ON owners.user_id = planet.user_id
JOIN themes ON themes.theme = planet.theme
CROSS JOIN days
JOIN moods ON moods.mood_index = (owners.owner_no * 5 + themes.theme_index * 3 + days.days_ago * 7) % 18
WHERE planet.id LIKE 'mv-demo-%'
  AND NOT EXISTS (
    SELECT 1 FROM mood_entries existing
    WHERE existing.id = planet.id || '-day-' || days.days_ago
       OR (existing.planet_id = planet.id AND existing.date = date('now', '+8 hours', '-' || days.days_ago || ' days'))
  );

INSERT OR IGNORE INTO planet_billboards
  (id, user_id, planet_id, kind, title, text, doodle_json, created_at, expires_at)
SELECT
  planet.id || '-billboard', planet.user_id, planet.id, 'user', '航行留言', planet.message, '[]',
  datetime('now'), datetime('now', '+7 days')
FROM user_planets planet
WHERE planet.user_id IN (
  'mv-demo-account-03', 'mv-demo-account-04', 'mv-demo-account-05', 'mv-demo-account-06',
  'mv-demo-account-07', 'mv-demo-account-08', 'mv-demo-account-09', 'mv-demo-account-10'
);

INSERT OR IGNORE INTO care_cards
  (id, user_id, planet_id, record_date, title, message, action, published, created_at, expires_at)
SELECT
  'care_' || planet.id || '_' || date('now', '+8 hours'),
  planet.user_id,
  planet.id,
  date('now', '+8 hours'),
  CASE planet.theme
    WHEN 'study' THEN '把期待变成一小步'
    WHEN 'career' THEN '先照顾眼前这一件事'
    WHEN 'court' THEN '让身体带你松一口气'
    WHEN 'lens' THEN '留住一束今天的光'
    WHEN 'create' THEN '允许想法慢慢成形'
    ELSE '把照顾自己也算进计划'
  END,
  '这条生活主线不需要一次走完。你已经在用自己的节奏前进，可以把今天做到的部分先收好。',
  CASE planet.theme
    WHEN 'study' THEN '只挑一小节复习 10 分钟，之后停下来伸展一下。'
    WHEN 'career' THEN '选一件能在 10 分钟内完成的小事，完成后就休息片刻。'
    WHEN 'court' THEN '做两分钟轻松热身，按身体的感觉决定接下来要不要继续。'
    WHEN 'lens' THEN '观察身边一处颜色或光线，拍下来或安静看一会儿。'
    WHEN 'create' THEN '随手画几笔或写几个词，不急着评价结果。'
    ELSE '喝几口水，做一次慢呼吸，再看看身体现在需要什么。'
  END,
  1, datetime('now'), datetime('now', '+7 days')
FROM user_planets planet
WHERE planet.user_id IN (
  'mv-demo-account-03', 'mv-demo-account-04', 'mv-demo-account-05', 'mv-demo-account-06',
  'mv-demo-account-07', 'mv-demo-account-08', 'mv-demo-account-09', 'mv-demo-account-10'
);
