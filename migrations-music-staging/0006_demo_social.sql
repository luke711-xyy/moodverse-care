-- Additive only. Registry enrollment requires a non-login synthetic identity.
CREATE TABLE IF NOT EXISTS music_demo_actors (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  identity_marker TEXT NOT NULL,
  greeting TEXT NOT NULL CHECK (length(greeting) BETWEEN 1 AND 2000)
);
CREATE TABLE IF NOT EXISTS music_demo_welcome_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  planet_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS music_demo_welcome_jobs (
  user_id TEXT NOT NULL REFERENCES music_demo_welcome_enrollments(user_id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  actor_user_id TEXT NOT NULL REFERENCES music_demo_actors(user_id) ON DELETE CASCADE,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'skipped')),
  request_id TEXT NOT NULL UNIQUE,
  completed_at TEXT,
  PRIMARY KEY (user_id, slot),
  UNIQUE (user_id, actor_user_id)
);
CREATE INDEX IF NOT EXISTS idx_music_demo_welcome_due ON music_demo_welcome_jobs(status, due_at);
CREATE TABLE IF NOT EXISTS music_demo_greetings (
  actor_user_id TEXT NOT NULL REFERENCES music_demo_actors(user_id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_user_id, recipient_user_id)
);
-- No existing real users are enrolled or sent an invitation by this migration.
-- Names only select copy; they never grant demo privileges.
INSERT INTO music_demo_actors (user_id, identity_marker, greeting)
SELECT u.id, u.token_hash, CASE replace(p.display_name, '演示·', '')
  WHEN '雾中航线' THEN '这里是雾中航线。愿这段旋律陪你穿过雾，慢慢靠岸。'
  WHEN '月面花房' THEN '欢迎来到月面花房。为你留了一束月光，让音乐慢慢开花。'
  WHEN '玻璃海' THEN '玻璃海收到你的信号了。把心事放轻一点，和浪声一起漂一会儿吧。'
  WHEN '林间电台' THEN '林间电台为你接通。树叶正在沙沙作响，愿这首歌给你一点绿意。'
  WHEN '夜班巴士' THEN '夜班巴士还有一个靠窗的位置。上车吧，让旋律陪你走过这段夜路。'
  WHEN '远岸来信' THEN '一封远岸来信送到了。隔着海也能听见同一首歌，真好。'
  WHEN '霓虹漫游者' THEN '霓虹已亮起，欢迎加入夜游。把节拍调到舒服的位置，一起听听城市。'
  WHEN '纸飞机观察站' THEN '纸飞机观察站收到你的信号。折一架小飞机，把今天的好心情送给你。'
  WHEN '凌晨潮汐' THEN '凌晨的潮汐轻轻涨起。愿这里的旋律陪你安静地待一会儿。'
  WHEN '微光候车室' THEN '微光候车室为你留着灯。下一班车来之前，先坐下来听首歌吧。'
  WHEN '空气邮局' THEN '空气邮局已签收你的频率。这是一封装着旋律的问候，送给路过的你。'
  WHEN '蓝色行星' THEN '蓝色行星收到你的讯号。愿这一点蓝，让今天的心情柔软一些。'
  WHEN '静默彗尾' THEN '一颗安静的彗星经过，留下一小段光。很高兴在这里与你相遇。'
  WHEN '蓝时书库' THEN '欢迎来到蓝时书库。翻开一页夜色，让旋律替文字说声你好。'
  WHEN '河流中转站' THEN '河流中转站到了。让今天的疲惫顺水而去，把一段好听的旋律留在身边。'
  WHEN '苔藓轨道' THEN '苔藓轨道轻轻向你靠近。这里不赶路，慢慢听，也慢慢生长。'
  WHEN '盐风档案' THEN '盐风档案收录了这次相遇。愿带着海盐味的旋律，陪你走一小段。'
  WHEN '云中庭' THEN '欢迎来到云中庭。推开窗就是一片轻盈的天空，送你一阵柔软的风。'
  WHEN '余烬海岸' THEN '余烬海岸还留着一点暖。把今天放下，听一首歌，等晚风吹来。'
  WHEN '远窗' THEN '远处的窗亮起了。虽然隔着星海，也想把这一小束光送给你。'
  WHEN '潮汐影院' THEN '潮汐影院即将开场。今晚的配乐已经备好，愿你在这里找到自己的片刻。'
  WHEN '小小轨道' THEN '小小轨道多了一位旅伴。很高兴遇见你，愿每次绕行都有一首新发现。'
  WHEN '雪原回声' THEN '雪原送来一声轻轻的回响。愿这段清澈的旋律，让你的世界安静一点。'
  WHEN '纸月亮' THEN '为你挂上一轮纸月亮。不必太明亮，能照见一小段旋律就好。'
  WHEN '漫长归途' THEN '漫长归途有人同路了。愿音乐陪你慢慢走，总有一盏灯在等你。'
  WHEN '雨后收音机' THEN '雨后收音机调到了你的频率。雨停了，一起听听空气里新鲜的声音吧。'
  ELSE '这里是' || p.display_name || '。' || CASE WHEN length(p.tagline) > 0 THEN p.tagline || '。' ELSE '' END || '很高兴在音乐里与你相遇。'
END || char(10) || '（示例星球的固定问候，无需回复。）'
FROM users u JOIN music_planets p ON p.owner_user_id = u.id
WHERE u.id LIKE 'demo:%' AND (u.token_hash = 'demo-disabled:' || u.id
  OR (u.token_hash = 'demo-disabled:' || substr(u.id, 6)
    AND (u.id LIKE 'demo:friend:%' OR u.id LIKE 'demo:visitor:%' OR u.id LIKE 'demo:request:%' OR u.id LIKE 'demo:bottle:%')))
ON CONFLICT(user_id) DO UPDATE SET greeting = excluded.greeting
WHERE music_demo_actors.identity_marker = excluded.identity_marker;
