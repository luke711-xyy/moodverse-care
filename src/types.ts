export type ThemeId =
  | 'study' | 'career' | 'court' | 'lens' | 'create' | 'care'
  | 'work_growth' | 'job_search' | 'skill_building' | 'intimacy' | 'family'
  | 'friendship' | 'wellbeing' | 'running' | 'exploration' | 'reading_writing'
  | 'music' | 'fitness' | 'gaokao' | 'healthy_eating'
export type MoodId =
  | 'joy' | 'hope' | 'calm' | 'sad' | 'anxious' | 'tired'
  | 'irritable' | 'anger' | 'lonely' | 'hurt' | 'confused' | 'relieved'
  | 'grateful' | 'content' | 'numb' | 'fear' | 'proud' | 'unnamed'
export type WeatherId =
  | 'golden_breeze' | 'updraft' | 'misty_clear' | 'light_rain' | 'charged_cloud' | 'low_light'
  | 'sunny' | 'overcast' | 'persistent_rain' | 'showers' | 'distant_thunder' | 'snow'
  | 'strong_wind' | 'clearing' | 'night_glow' | 'thunderstorm' | 'typhoon' | 'hail'
  | 'cloudy' | 'sandstorm'
export type PrivacyMode = 'private' | 'mood_theme_public' | 'billboard_public'

export type DoodleStroke = {
  points: Array<[number, number]>
  color: string
  width: number
  coordinateSpace?: 'normalized'
}

export type Billboard = {
  id: string
  kind: 'user' | 'ai' | 'reply'
  title?: string
  text: string
  createdAt: string
  expiresAt?: string
  authorName?: string
  doodle?: DoodleStroke[]
}

export type WeatherSample = {
  date: string
  mood: MoodId
  intensity: number
}

export type MoodEntry = {
  id: string
  planetId: string
  date: string
  theme: ThemeId
  mood: MoodId
  intensity: number
  triggers: string[]
  privateNote: string
  publicMessage: string
  privacy: PrivacyMode
  musicUrl: string
  doodle: DoodleStroke[]
  createdAt: string
}

export type Planet = {
  id: string
  alias: string
  tagline?: string
  visualSeed?: string
  createdAt?: string
  archivedAt?: string | null
  theme: ThemeId
  mood: MoodId
  intensity: number
  message: string
  musicUrl?: string
  doodle?: DoodleStroke[]
  isSeed?: boolean
  owner?: boolean
  billboard?: Billboard
  billboards?: Billboard[]
  weatherHistory?: WeatherSample[]
  position: [number, number, number]
  orbit: number
}

export type StarAppearance = {
  color: string
  texture?: string
}

export type CareCard = {
  id: string
  planetId: string
  title: string
  message: string
  action: string
  createdAt: string
  expiresAt: string
  published: boolean
}

export type ThemeMeta = {
  id: ThemeId
  label: string
  short: string
  color: string
  glow: string
  glyph: string
  description: string
}

export type MoodMeta = {
  id: MoodId
  label: string
  glyph: string
  color: string
  valence: number
  arousal: number
}

export const THEMES: ThemeMeta[] = [
  { id: 'study', label: '考研', short: '深潜学习', color: '#70c8ff', glow: '#2b73d8', glyph: '◈', description: '把注意力放回下一小步' },
  { id: 'career', label: '考公', short: '稳定航线', color: '#ffb870', glow: '#d66343', glyph: '✦', description: '在不确定里整理秩序' },
  { id: 'court', label: '球类运动', short: '热身上场', color: '#ff76b6', glow: '#b92673', glyph: '◒', description: '让身体先替心情动起来' },
  { id: 'lens', label: '摄影', short: '寻找光线', color: '#89f4ce', glow: '#118c83', glyph: '◉', description: '把今天的光留在镜头里' },
  { id: 'create', label: '艺术创作', short: '搭建世界', color: '#c39cff', glow: '#684bd2', glyph: '✧', description: '让想法拥有可以停靠的地方' },
  { id: 'care', label: '自我成长', short: '回到自己', color: '#ffd36b', glow: '#ad6726', glyph: '☼', description: '留一点时间给正在努力的你' },
  { id: 'work_growth', label: '职场成长', short: '协作与积累', color: '#76dfc8', glow: '#258b83', glyph: '⌘', description: '适应协作、节奏与能力积累' },
  { id: 'job_search', label: '求职', short: '寻找下一站', color: '#f5b477', glow: '#a65d4a', glyph: '↗', description: '寻找下一段工作或转向新方向' },
  { id: 'skill_building', label: '技能养成', short: '反复练习', color: '#69b8ed', glow: '#3569bd', glyph: '⌁', description: '把大目标拆成可重复练习的小步' },
  { id: 'intimacy', label: '亲密关系', short: '靠近与边界', color: '#ef89b4', glow: '#9e4974', glyph: '♡', description: '记录靠近、边界与相互理解' },
  { id: 'family', label: '家庭关系', short: '一起生活', color: '#e7b887', glow: '#926b4f', glyph: '⌂', description: '面对家庭责任、照护与相处' },
  { id: 'friendship', label: '友谊与社交', short: '连接与回声', color: '#8ee5d0', glow: '#398f91', glyph: '◎', description: '保存连接感、疏离感与社交恢复' },
  { id: 'wellbeing', label: '身心健康', short: '休息与恢复', color: '#8eb5c8', glow: '#506f91', glyph: '◌', description: '留出休息、康复和恢复能量的空间' },
  { id: 'running', label: '跑步与体能', short: '身体的节奏', color: '#a5dc85', glow: '#568d59', glyph: '↝', description: '持续运动、体能和身体目标' },
  { id: 'exploration', label: '旅行与探索', short: '走向远方', color: '#79cbe1', glow: '#3c7fa0', glyph: '✧', description: '探索新的地点、体验和可能性' },
  { id: 'reading_writing', label: '阅读与写作', short: '字句之间', color: '#b69ee8', glow: '#705995', glyph: '▤', description: '阅读、写作和长期表达' },
  { id: 'music', label: '音乐', short: '声音停靠', color: '#e29cce', glow: '#985d91', glyph: '♫', description: '用声音练习、表达或获得陪伴' },
  { id: 'fitness', label: '健身', short: '力量与节律', color: '#ffbf69', glow: '#b7713d', glyph: '✦', description: '在力量训练与身体节律中积累变化' },
  { id: 'gaokao', label: '高考', short: '走向考场', color: '#8eb6ff', glow: '#5672c2', glyph: '◈', description: '面对阶段考试，把注意力放回今天能做的一步' },
  { id: 'healthy_eating', label: '健康饮食', short: '照料日常', color: '#b4dc89', glow: '#708f4f', glyph: '◇', description: '留意饮食节奏与身体需要，不追求完美' },
]

export const MOODS: MoodMeta[] = [
  { id: 'joy', label: '开心', glyph: '✹', color: 'oklch(.82 .16 91)', valence: 0.9, arousal: 0.7 },
  { id: 'hope', label: '期待', glyph: '↗', color: 'oklch(.79 .16 54)', valence: 0.65, arousal: 0.8 },
  { id: 'calm', label: '平静', glyph: '○', color: 'oklch(.78 .13 178)', valence: 0.45, arousal: 0.2 },
  { id: 'sad', label: '悲伤', glyph: '⌁', color: 'oklch(.76 .13 252)', valence: -0.65, arousal: 0.25 },
  { id: 'anxious', label: '焦虑', glyph: '⚡', color: 'oklch(.78 .17 35)', valence: -0.45, arousal: 0.95 },
  { id: 'tired', label: '疲惫', glyph: 'z', color: 'oklch(.74 .1 286)', valence: -0.2, arousal: 0.1 },
  { id: 'irritable', label: '烦躁', glyph: '⌇', color: 'oklch(.78 .17 24)', valence: -0.38, arousal: 0.76 },
  { id: 'anger', label: '愤怒', glyph: '✹', color: 'oklch(.73 .19 12)', valence: -0.72, arousal: 0.9 },
  { id: 'lonely', label: '孤独', glyph: '·', color: 'oklch(.73 .12 232)', valence: -0.58, arousal: 0.32 },
  { id: 'hurt', label: '委屈', glyph: '⌁', color: 'oklch(.76 .14 344)', valence: -0.53, arousal: 0.44 },
  { id: 'confused', label: '困惑', glyph: '⁇', color: 'oklch(.79 .13 306)', valence: -0.12, arousal: 0.5 },
  { id: 'relieved', label: '释然', glyph: '↘', color: 'oklch(.78 .13 153)', valence: 0.55, arousal: 0.3 },
  { id: 'grateful', label: '感激', glyph: '✧', color: 'oklch(.81 .14 116)', valence: 0.76, arousal: 0.42 },
  { id: 'content', label: '充实', glyph: '◉', color: 'oklch(.8 .13 135)', valence: 0.68, arousal: 0.38 },
  { id: 'numb', label: '麻木', glyph: '○', color: 'oklch(.72 .07 214)', valence: -0.04, arousal: 0.12 },
  { id: 'fear', label: '害怕', glyph: '⌑', color: 'oklch(.75 .16 273)', valence: -0.68, arousal: 0.88 },
  { id: 'proud', label: '自豪', glyph: '✦', color: 'oklch(.79 .18 334)', valence: 0.78, arousal: 0.72 },
  { id: 'unnamed', label: '说不清', glyph: '…', color: 'oklch(.78 .07 194)', valence: 0, arousal: 0.3 },
]

export const TRIGGERS = ['学习/工作', '关系', '睡眠/身体', '财务', '社交', '自我期待', '环境变化', '突发事件']

export const themeById = (id: ThemeId) => THEMES.find((theme) => theme.id === id) ?? THEMES[0]
export const moodById = (id: MoodId) => MOODS.find((mood) => mood.id === id) ?? MOODS[2]
export const THEME_IDS = THEMES.map((theme) => theme.id) as ThemeId[]
export const MAX_FOCUSED_THEMES = 6
export const DEFAULT_FOCUSED_THEMES = THEMES.slice(0, MAX_FOCUSED_THEMES).map((theme) => theme.id)
export const MOOD_IDS = MOODS.map((mood) => mood.id) as MoodId[]

export const todayKey = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export const uid = (prefix = 'mv') => `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
