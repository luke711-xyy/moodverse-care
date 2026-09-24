export type CareContext = {
  mood: string
  theme: string
  intensity: number
  triggers: string[]
}

export type CareCopy = { title: string; message: string; action: string }

type MoodTemplate = {
  title: string
  message: string
  action: string
  intenseTitle?: string
  intenseMessage?: string
  intenseAction?: string
}

const MOOD_TEMPLATES: Record<string, MoodTemplate> = {
  joy: { title: '把今天的好心情留一份给未来', message: '这份轻快值得被记住，不必急着把它变成更多任务。', action: '记下一件今天让你微笑的小事。', intenseTitle: '给这份亮光找个落点', intenseMessage: '开心也可以很有力量，给它一个舒服的出口就好。', intenseAction: '选一首喜欢的歌，听完这一首再继续。' },
  hope: { title: '把期待变成一小步', message: '不需要现在看清整条路，下一步已经足够。', action: '写下明天最想推进的一件小事。' },
  calm: { title: '留住这段安静的半径', message: '平静不必被填满，可以给自己留一点空白。', action: '放一首熟悉的歌，慢慢听完它。' },
  sad: { title: '先陪自己坐一会儿', message: '难过不需要立刻被修好，你可以先被温柔地接住。', action: '喝几口温水，把脚踩在地面上片刻。', intenseTitle: '先把今天调成低功耗', intenseMessage: '这阵难过有些沉，先不要求自己解释或解决它。', intenseAction: '找个舒服的位置坐下，给自己两分钟缓冲。' },
  anxious: { title: '给脑内警报一个出口', message: '焦虑在提醒你有事挂心，但此刻不必一次处理全部。', action: '试试吸气 4 拍、呼气 6 拍，重复几轮。', intenseTitle: '先回到眼前这一分钟', intenseMessage: '当担心变得很满时，可以先缩小范围，只照顾当下。', intenseAction: '慢慢呼气，再说出眼前看见的三样东西。' },
  tired: { title: '把恢复也算进计划', message: '疲惫不是落后，它也在告诉你需要一点余量。', action: '关掉一个不急的通知，伸展两分钟。', intenseTitle: '今天可以少做一点', intenseMessage: '能量已经不多时，休息本身就是合理的一步。', intenseAction: '暂停手边一件非紧急的事，闭眼休息几分钟。' },
  irritable: { title: '给自己留一点缓冲', message: '烦躁出现时，先和刺激源拉开一点距离也可以。', action: '离开嘈杂处，轻轻活动一下肩颈。', intenseTitle: '先暂停回应', intenseMessage: '情绪很满时不用马上回复或做决定，给自己一点间隔。', intenseAction: '暂时放下屏幕，走到安静处待两分钟。' },
  anger: { title: '先让身体慢下来', message: '愤怒可能在守护重要的边界，等平稳些再决定怎么表达。', action: '把此刻最想守住的边界写成一句话。', intenseTitle: '先不急着做决定', intenseMessage: '强烈的愤怒值得被认真对待，也可以先给回应留点时间。', intenseAction: '暂时离开冲突现场，等呼吸平稳后再选择下一步。' },
  lonely: { title: '接一束现实里的光', message: '孤单的时候，你仍然值得被连接；不用把话说得很完整。', action: '给信任的人发一句简单的问候。', intenseTitle: '让连接先从一点点开始', intenseMessage: '现在不必独自扛住所有感受，找一个安全的陪伴入口。', intenseAction: '给信任的人发“有空陪我说几分钟吗”。' },
  hurt: { title: '先照顾没被听见的部分', message: '受伤的感受可以先被承认，不必马上替任何人找理由。', action: '写下此刻最希望别人理解的一句话。', intenseTitle: '把自己放回优先的位置', intenseMessage: '这份刺痛值得被温柔对待，先做一件让自己安心的小事。', intenseAction: '去一个让你觉得安全、舒服的地方待一会儿。' },
  confused: { title: '允许答案晚一点出现', message: '不确定并不代表你做错了，可以先整理已经知道的部分。', action: '分两列写下“我知道的”和“还不确定的”。' },
  relieved: { title: '把松下来的这一刻记住', message: '事情告一段落后，不必马上填满空出来的位置。', action: '给自己留五分钟，不安排下一件事。' },
  grateful: { title: '把这份感谢收好', message: '小小的珍惜也很真实，可以让它多停留一会儿。', action: '记下一件今天想感谢的人或事。' },
  content: { title: '保留现在刚好的节奏', message: '今天已经有足够的部分，不必为了证明什么继续加码。', action: '选一件已完成的事，为今天画个句号。' },
  numb: { title: '从一个小小的感官开始', message: '暂时没有明显感受也没关系，不需要逼自己立刻命名。', action: '摸摸手边熟悉的物品，留意它的温度和质感。', intenseTitle: '先和此刻建立一点连接', intenseMessage: '如果一切都显得很远，可以从一个安全的小感官开始。', intenseAction: '喝一口水，留意温度，然后看看周围的光线。' },
  fear: { title: '先回到此刻的身体', message: '害怕时不必责怪自己，先确认此刻身边有哪些支持。', action: '慢慢呼气，辨认眼前三件具体的东西。', intenseTitle: '先找到安全的一小步', intenseMessage: '这份害怕值得被认真对待，先靠近让你更安全的人或地方。', intenseAction: '联系一位信任的人，或移步到让你安心的地方。' },
  proud: { title: '为自己的投入留一份证据', message: '你付出的那一步值得被看见，不需要等到完美才庆祝。', action: '记下今天哪一步是你亲手完成的。' },
  unnamed: { title: '暂时不命名也可以', message: '有些天气需要时间才会显出轮廓，你可以先不急着解释。', action: '喝口水，或安静待一分钟。', intenseTitle: '先不用弄明白', intenseMessage: '当感受还没有名字时，先照顾眼前的自己就够了。', intenseAction: '把双脚放稳，慢慢呼气几次。' },
}

const THEME_ACTIONS: Record<string, string> = {
  study: '只挑一道题或一页内容，专注 10 分钟就停下来看看。',
  career: '把眼前事项拆成一个可在 10 分钟内完成的小动作。',
  court: '做两分钟轻松热身，感受身体从静止到移动。',
  lens: '留意身边一处光线或颜色，拍下来或只看一会儿。',
  create: '随手画几笔或写几个词，不评价它们好不好。',
  care: '做一件让此刻身体舒服一点的小事。',
  work_growth: '记下今天学到的一点经验，先不急着归纳结论。',
  job_search: '只看一个岗位，标出一项符合和一项想了解的要求。',
  skill_building: '打开练习材料做一个最小例子，十分钟后就可以收工。',
  intimacy: '先写下自己真正想表达的需要，不必立刻发送。',
  family: '把想说的话缩成一句清楚、温和的表达。',
  friendship: '给一位让你感到自在的人发个简单问候。',
  wellbeing: '喝些水，起身活动一下，再感受身体是否需要休息。',
  running: '换上舒服的鞋，散步几分钟也算和身体一起出发。',
  exploration: '去熟悉的路线之外走一小段，看看一个新的细节。',
  reading_writing: '读一小段或写两句话，不需要完成整章。',
  music: '选一首此刻合适的歌，只听这一首。',
  fitness: '做几次轻柔伸展，以舒服为准，不追求强度。',
  gaokao: '挑一个最小知识点复习十分钟，然后安心停下。',
  healthy_eating: '为自己准备一份简单、熟悉、方便的食物。',
}

const HIGH_INTENSITY_MOODS = new Set(['sad', 'anxious', 'tired', 'irritable', 'anger', 'lonely', 'hurt', 'numb', 'fear', 'unnamed'])

/**
 * Deterministic, private-by-default copy for one successful daily check-in.
 * The generation boundary is intentionally small so a user-configured model
 * provider can replace this matcher later without changing check-in storage.
 */
export function matchCareTemplate(context: CareContext): CareCopy {
  const template = MOOD_TEMPLATES[context.mood] ?? MOOD_TEMPLATES.unnamed
  const highIntensity = context.intensity >= 4 && HIGH_INTENSITY_MOODS.has(context.mood)
  const title = highIntensity ? template.intenseTitle ?? template.title : template.title
  const acknowledgement = highIntensity ? template.intenseMessage ?? template.message : template.message
  const topicAction = THEME_ACTIONS[context.theme]
  const action = highIntensity ? template.intenseAction ?? template.action : topicAction ?? template.action
  const trigger = context.triggers.find((item) => item.trim())?.trim()
  const personalNote = trigger ? `如果「${trigger.slice(0, 40)}」还占着心思，可以先把它放在纸上，不用马上解决。` : ''
  const themeLine = topicAction && !highIntensity ? ' 在这条生活主线上，也只需要照顾好下一小步。' : ''
  return {
    title,
    message: `${acknowledgement}${themeLine}${personalNote}`.slice(0, 260),
    action: action.slice(0, 140),
  }
}
