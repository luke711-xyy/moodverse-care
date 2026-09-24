-- Idempotent initial fixtures for the six default theme galaxies.
-- Two non-loginable sample owners each have one public planet per theme (12 total).
-- Every planet uses the production user_planets + mood_entries + billboard + care_card schema.
-- scripts/seed-default-galaxy-planets.sql adds enough matching assets to bring each galaxy to ten.

INSERT OR IGNORE INTO users
  (id, token_hash, timezone, last_planet_id, star_color, star_texture_webp, created_at, updated_at)
VALUES
  ('mv-demo-account-01', 'a43a18c2d0455f6ada64764be02b91f8c6c05b0a1a7a15e8ecb11a810c993ffe', 'Asia/Shanghai', NULL, '#70c8ff', '', datetime('now'), datetime('now')),
  ('mv-demo-account-02', 'bed03bc4f37548765fc7d75ede6541bf2ccf114466cbdb1d56fa6fb74083527f', 'Asia/Shanghai', NULL, '#ffd36b', '', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO user_preferences (user_id, focused_themes_json, updated_at)
VALUES
  ('mv-demo-account-01', '["study","career","court","lens","create","care"]', datetime('now')),
  ('mv-demo-account-02', '["study","career","court","lens","create","care"]', datetime('now'));

WITH seed_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message, music_url, doodle_json, visibility, archived_at, created_at, updated_at)
AS (VALUES
  ('mv-demo-01-study', 'mv-demo-account-01', '示例·慢行航线', '先照顾好眼前的一页。', 'study', 'mv-demo-visual-study-a', 'hope', 3, '【示例样本】不需要一次走完整条路。今天认真看完这一页，明天再从新的地方出发。', '', '[{"points":[[0.18,0.62],[0.31,0.48],[0.43,0.57],[0.57,0.34],[0.69,0.45],[0.82,0.28]],"color":"#70c8ff","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-01-career', 'mv-demo-account-01', '示例·候场星', '把不确定拆成今天能做的小事。', 'career', 'mv-demo-visual-career-a', 'anxious', 4, '【示例样本】还没等到结果，也不代表这段准备没有意义。先把今天能做的小事做好，剩下的交给时间。', '', '[{"points":[[0.24,0.67],[0.36,0.52],[0.48,0.58],[0.61,0.39],[0.77,0.46]],"color":"#ffb870","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-01-court', 'mv-demo-account-01', '示例·逐光球场', '愿意重新上场，就已经很勇敢。', 'court', 'mv-demo-visual-court-a', 'joy', 3, '【示例样本】练球不一定每天都要赢。今天愿意来到场上，已经是身体替我写下的一句鼓励。', '', '[{"points":[[0.24,0.68],[0.24,0.38],[0.39,0.38],[0.39,0.68],[0.24,0.68]],"color":"#ff76b6","width":0.012,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-01-lens', 'mv-demo-account-01', '示例·窗边取景', '把今天的光留在镜头里。', 'lens', 'mv-demo-visual-lens-a', 'calm', 2, '【示例样本】窗边那点傍晚的光很安静。拍下来之后，才发现普通日子也有值得保存的颜色。', '', '[{"points":[[0.22,0.62],[0.34,0.43],[0.51,0.55],[0.67,0.34],[0.8,0.5]],"color":"#89f4ce","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-01-create', 'mv-demo-account-01', '示例·像素花园', '先让一个小小的念头长出来。', 'create', 'mv-demo-visual-create-a', 'tired', 3, '【示例样本】先把一个小小的念头做出来，哪怕只有轮廓。完整之前，也可以先喜欢它一点点。', '', '[{"points":[[0.25,0.62],[0.39,0.42],[0.5,0.62],[0.61,0.42],[0.75,0.62]],"color":"#c39cff","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-01-care', 'mv-demo-account-01', '示例·潮汐之间', '留一点空白给正在生活的自己。', 'care', 'mv-demo-visual-care-a', 'grateful', 3, '【示例样本】最近在练习不用把每个空白都填满。停下来听一会儿风，也是今天认真生活的一部分。', '', '[{"points":[[0.18,0.55],[0.3,0.42],[0.42,0.55],[0.54,0.42],[0.66,0.55],[0.8,0.42]],"color":"#ffd36b","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-study', 'mv-demo-account-02', '示例·下一页', '不必追赶别人，只和昨天的自己并肩。', 'study', 'mv-demo-visual-study-b', 'anxious', 4, '【示例样本】脑子很满的时候，先只做一道题。做完这一小步，就可以允许自己停下来呼吸。', '', '[{"points":[[0.2,0.66],[0.33,0.5],[0.46,0.59],[0.6,0.36],[0.8,0.45]],"color":"#70c8ff","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-career', 'mv-demo-account-02', '示例·未定日历', '还没定下来的事，也可以慢慢整理。', 'career', 'mv-demo-visual-career-b', 'hope', 3, '【示例样本】这条路偶尔绕远也没关系。愿我们把能做的小事做好，也给不确定留一点空间。', '', '[{"points":[[0.2,0.62],[0.32,0.44],[0.45,0.56],[0.58,0.4],[0.69,0.52],[0.82,0.34]],"color":"#ffb870","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-court', 'mv-demo-account-02', '示例·风里练习', '今天的目标只是舒服地动一动。', 'court', 'mv-demo-visual-court-b', 'sad', 3, '【示例样本】状态不好的日子，也可以只做一点轻松练习。来过球场、动过身体，就已经够了。', '', '[{"points":[[0.25,0.66],[0.35,0.43],[0.48,0.6],[0.62,0.36],[0.77,0.54]],"color":"#ff76b6","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-lens', 'mv-demo-account-02', '示例·收集微光', '今天也有一束光经过这里。', 'lens', 'mv-demo-visual-lens-b', 'joy', 4, '【示例样本】出门时遇见一小片好看的云。愿你也能在普通的一天里，收到一点不必解释的快乐。', '', '[{"points":[[0.24,0.5],[0.38,0.5],[0.45,0.33],[0.52,0.5],[0.68,0.5],[0.75,0.67],[0.82,0.5]],"color":"#89f4ce","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-create', 'mv-demo-account-02', '示例·还在搭建', '草稿也有自己的生长季节。', 'create', 'mv-demo-visual-create-b', 'proud', 3, '【示例样本】今天终于把想法搭出了一个小小的形状。它还不完整，但我已经愿意让它被看见。', '', '[{"points":[[0.24,0.66],[0.38,0.48],[0.5,0.62],[0.62,0.4],[0.77,0.56]],"color":"#c39cff","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now')),
  ('mv-demo-02-care', 'mv-demo-account-02', '示例·留白小行星', '给今天留出刚刚好的空间。', 'care', 'mv-demo-visual-care-b', 'calm', 2, '【示例样本】此刻没有特别大的答案也没关系。愿这一小段安静，能让你重新听见自己的节奏。', '', '[{"points":[[0.26,0.56],[0.36,0.44],[0.46,0.56],[0.56,0.44],[0.66,0.56],[0.76,0.44]],"color":"#ffd36b","width":0.014,"coordinateSpace":"normalized"}]', 'billboard_public', NULL, datetime('now','-6 days'), datetime('now'))
)
INSERT INTO user_planets
  (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message, music_url, doodle_json, visibility, archived_at, created_at, updated_at)
SELECT seed.* FROM seed_planets seed
WHERE NOT EXISTS (
  SELECT 1 FROM user_planets existing
  WHERE existing.id = seed.id OR (existing.user_id = seed.user_id AND existing.theme = seed.theme)
);

-- Histories are ordered by days_ago (0 = today). The renderer derives weather and terrain changes from these real mood records.
WITH RECURSIVE days(days_ago) AS (
  SELECT 0 UNION ALL SELECT days_ago + 1 FROM days WHERE days_ago < 6
),
series(planet_id, moods, intensities, trigger_text) AS (VALUES
  ('mv-demo-01-study', '["hope","calm","anxious","anxious","tired","calm","sad"]', '[3,2,4,3,4,2,3]', '复习安排'),
  ('mv-demo-01-career', '["anxious","anxious","calm","hope","tired","anxious","sad"]', '[4,3,2,3,3,4,2]', '准备节奏'),
  ('mv-demo-01-court', '["joy","tired","joy","calm","anxious","joy","calm"]', '[3,3,4,2,3,4,2]', '身体状态'),
  ('mv-demo-01-lens', '["calm","joy","calm","hope","calm","tired","hope"]', '[2,3,2,4,2,3,3]', '光线变化'),
  ('mv-demo-01-create', '["tired","tired","proud","anxious","calm","hope","calm"]', '[3,4,4,3,2,3,2]', '创作进度'),
  ('mv-demo-01-care', '["grateful","content","sad","relieved","grateful","calm","joy"]', '[3,3,4,3,4,2,3]', '休息时间'),
  ('mv-demo-02-study', '["anxious","confused","anxious","hope","tired","anxious","sad"]', '[4,3,4,3,3,4,3]', '复习安排'),
  ('mv-demo-02-career', '["hope","calm","hope","anxious","calm","hope","confused"]', '[3,2,3,4,2,3,3]', '准备节奏'),
  ('mv-demo-02-court', '["sad","sad","tired","calm","hope","anxious","calm"]', '[3,4,3,2,2,4,3]', '身体状态'),
  ('mv-demo-02-lens', '["joy","content","joy","grateful","calm","sad","joy"]', '[4,3,5,3,2,4,3]', '光线变化'),
  ('mv-demo-02-create', '["proud","tired","hope","proud","anxious","relieved","hope"]', '[3,4,3,4,4,2,3]', '创作进度'),
  ('mv-demo-02-care', '["calm","calm","anxious","calm","tired","content","relieved"]', '[2,2,4,3,4,3,2]', '休息时间')
)
INSERT INTO mood_entries
  (id, user_id, planet_id, billboard_id, date, theme, mood, intensity, triggers_json, private_note, public_message, privacy, music_url, doodle_json, created_at)
SELECT
  p.id || '-day-' || days.days_ago,
  p.user_id,
  p.id,
  CASE WHEN days.days_ago = 0 THEN p.id || '-billboard' ELSE NULL END,
  date('now', '+8 hours', '-' || days.days_ago || ' days'),
  p.theme,
  json_extract(series.moods, '$[' || days.days_ago || ']'),
  json_extract(series.intensities, '$[' || days.days_ago || ']'),
  json_array(series.trigger_text),
  '',
  CASE WHEN days.days_ago = 0 THEN p.message ELSE '' END,
  CASE WHEN days.days_ago = 0 THEN 'billboard_public' ELSE 'mood_theme_public' END,
  '',
  CASE WHEN days.days_ago = 0 THEN p.doodle_json ELSE '[]' END,
  datetime('now', '-' || days.days_ago || ' days')
FROM user_planets p
JOIN series ON series.planet_id = p.id
CROSS JOIN days
WHERE NOT EXISTS (
  SELECT 1 FROM mood_entries existing
  WHERE existing.id = p.id || '-day-' || days.days_ago
    OR (existing.planet_id = p.id AND existing.date = date('now', '+8 hours', '-' || days.days_ago || ' days'))
);

-- The billboard asset is a real table row; doodles stay on the planet surface, not on the sign.
INSERT OR IGNORE INTO planet_billboards
  (id, user_id, planet_id, kind, title, text, doodle_json, created_at, expires_at)
SELECT id || '-billboard', user_id, id, 'user', '示例留言', message, '[]', datetime('now'), datetime('now', '+7 days')
FROM user_planets WHERE id LIKE 'mv-demo-%';

-- One generated-style care recommendation per sample planet, published for a week to exercise the public care-board path.
WITH cards(planet_id, title, message, action) AS (VALUES
  ('mv-demo-01-study', '把期待变成一小步', '不需要现在看清整条路，下一步已经足够。 在这条生活主线上，也只需要照顾好下一小步。', '只挑一道题或一页内容，专注 10 分钟就停下来看看。'),
  ('mv-demo-01-career', '先回到眼前这一分钟', '当担心变得很满时，可以先缩小范围，只照顾当下。', '慢慢呼气，再说出眼前看见的三样东西。'),
  ('mv-demo-01-court', '把今天的好心情留一份给未来', '这份轻快值得被记住，不必急着把它变成更多任务。 在这条生活主线上，也只需要照顾好下一小步。', '做两分钟轻松热身，感受身体从静止到移动。'),
  ('mv-demo-01-lens', '留住这段安静的半径', '平静不必被填满，可以给自己留一点空白。 在这条生活主线上，也只需要照顾好下一小步。', '留意身边一处光线或颜色，拍下来或只看一会儿。'),
  ('mv-demo-01-create', '把恢复也算进计划', '疲惫不是落后，它也在告诉你需要一点余量。 在这条生活主线上，也只需要照顾好下一小步。', '随手画几笔或写几个词，不评价它们好不好。'),
  ('mv-demo-01-care', '把这份感谢收好', '小小的珍惜也很真实，可以让它多停留一会儿。 在这条生活主线上，也只需要照顾好下一小步。', '做一件让此刻身体舒服一点的小事。'),
  ('mv-demo-02-study', '先回到眼前这一分钟', '当担心变得很满时，可以先缩小范围，只照顾当下。', '慢慢呼气，再说出眼前看见的三样东西。'),
  ('mv-demo-02-career', '把期待变成一小步', '不需要现在看清整条路，下一步已经足够。 在这条生活主线上，也只需要照顾好下一小步。', '把眼前事项拆成一个可在 10 分钟内完成的小动作。'),
  ('mv-demo-02-court', '先陪自己坐一会儿', '难过不需要立刻被修好，你可以先被温柔地接住。 在这条生活主线上，也只需要照顾好下一小步。', '做两分钟轻松热身，感受身体从静止到移动。'),
  ('mv-demo-02-lens', '把今天的好心情留一份给未来', '这份轻快值得被记住，不必急着把它变成更多任务。 在这条生活主线上，也只需要照顾好下一小步。', '留意身边一处光线或颜色，拍下来或只看一会儿。'),
  ('mv-demo-02-create', '为自己的投入留一份证据', '你付出的那一步值得被看见，不需要等到完美才庆祝。 在这条生活主线上，也只需要照顾好下一小步。', '随手画几笔或写几个词，不评价它们好不好。'),
  ('mv-demo-02-care', '留住这段安静的半径', '平静不必被填满，可以给自己留一点空白。 在这条生活主线上，也只需要照顾好下一小步。', '做一件让此刻身体舒服一点的小事。')
)
INSERT OR IGNORE INTO care_cards
  (id, user_id, planet_id, record_date, title, message, action, published, created_at, expires_at)
SELECT
  'care_' || p.id || '_' || date('now', '+8 hours'),
  p.user_id,
  p.id,
  date('now', '+8 hours'),
  cards.title,
  cards.message,
  cards.action,
  1,
  datetime('now'),
  datetime('now', '+7 days')
FROM cards JOIN user_planets p ON p.id = cards.planet_id;
