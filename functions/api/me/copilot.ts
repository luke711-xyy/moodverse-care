import { type CopilotContext, type CopilotMessage, type CopilotProvider } from '../../../src/music/copilot/contracts'
import { type Env } from '../../_shared'
import {
  bodyJson,
  capabilities,
  currentDayRange,
  endpoint,
  ensureProfile,
  fail,
  historyPage,
  memories,
  messagesFor,
  object,
  profile,
  string,
  week,
  type TurnRow,
} from '../../_music-copilot-state'
import { copilotFacts, refreshMessages } from '../../_music-copilot-facts'
import { speak } from '../../_music-copilot-model'

async function state(env: Env, uid: string, day: ReturnType<typeof currentDayRange>) {
  const [p, m, page] = await Promise.all([profile(env, uid), memories(env, uid), historyPage(env, uid, day)])
  return {
    settings: p.settings,
    memories: m,
    messages: await refreshMessages(env, uid, page.rows.flatMap(messagesFor)),
    nextCursor: page.nextCursor,
    capabilities: capabilities(env),
  }
}
export const onRequestGet = endpoint((env, uid, request) => state(env, uid, currentDayRange(request)))

export const onRequestPatch = endpoint(async (env, uid, request) => {
  const day = currentDayRange(request)
  const input = await bodyJson(request),
    change = input.settings,
    mem = input.memory
  if (mem !== undefined && (change !== undefined || input.clearHistory)) return fail(400, 'ONE_MEMORY_CHANGE_AT_A_TIME')
  if (
    Object.keys(input).some((k) => !['settings', 'memory', 'clearHistory'].includes(k)) ||
    (!change && !mem && input.clearHistory !== true) ||
    (input.clearHistory !== undefined && typeof input.clearHistory !== 'boolean')
  )
    fail(400, 'INVALID_PATCH')
  const queries: D1PreparedStatement[] = [ensureProfile(env, uid)]
  const updates = ['active_request=NULL', 'active_until=0']
  const args: (string | number)[] = []
  if (change !== undefined) {
    if (!object(change)) return fail(400, 'INVALID_SETTINGS')
    for (const [k, v] of Object.entries(change)) {
      if (k === 'name' && string(v, 24)) {
        updates.push('name=?')
        args.push(string(v, 24))
      } else if (k === 'personality' && ['warm', 'concise', 'playful'].includes(String(v))) {
        updates.push('personality=?')
        args.push(String(v))
      } else if (k === 'proactivity' && ['off', 'low', 'normal'].includes(String(v))) {
        updates.push('proactivity=?')
        args.push(String(v))
      } else if (k === 'memoryEnabled' && typeof v === 'boolean') {
        updates.push('memory_enabled=?')
        args.push(Number(v))
      } else if (k === 'voiceEnabled' && typeof v === 'boolean') {
        updates.push('voice_enabled=?')
        args.push(Number(v))
      } else fail(400, 'INVALID_SETTINGS')
    }
  }
  if (mem !== undefined || input.clearHistory || (object(change) && 'memoryEnabled' in change))
    updates.push('context_version=context_version+1')
  queries.push(
    env.DB.prepare('UPDATE music_copilot_profiles SET ' + updates.join(',') + ' WHERE user_id=?').bind(...args, uid),
  )
  if (mem !== undefined) {
    if (!object(mem)) return fail(400, 'INVALID_MEMORY')
    const id = string(mem.id, 100),
      text = string(mem.text, 180),
      now = new Date().toISOString()
    if (mem.action === 'clear')
      queries.push(env.DB.prepare('DELETE FROM music_copilot_memories WHERE user_id=?').bind(uid))
    else if (mem.action === 'forget' && id)
      queries.push(env.DB.prepare('DELETE FROM music_copilot_memories WHERE user_id=? AND id=?').bind(uid, id))
    else if (mem.action === 'edit' && id && text) {
      const mood = recentMood(text)
      queries.push(
        env.DB.prepare(
          `UPDATE music_copilot_memories SET text=?1,updated_at=?2,
          kind=CASE WHEN ?5 IS NULL THEN kind ELSE 'mood' END,
          expires_at=CASE WHEN ?5 IS NULL THEN expires_at ELSE ?5 END WHERE user_id=?3 AND id=?4`,
        ).bind(text, now, uid, id, mood ? new Date(Date.now() + week).toISOString() : null),
      )
    } else if (mem.action === 'add' && text) {
      const mood = recentMood(text)
      queries.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO music_copilot_memories(id,user_id,text,kind,updated_at,expires_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM music_copilot_memories WHERE user_id=?)<40`,
        ).bind(
          crypto.randomUUID(),
          uid,
          text,
          mood ? 'mood' : 'preference',
          now,
          mood ? new Date(Date.now() + week).toISOString() : null,
          uid,
        ),
      )
    } else return fail(400, 'INVALID_MEMORY')
  }
  if (input.clearHistory) queries.push(env.DB.prepare('DELETE FROM music_copilot_turns WHERE user_id=?').bind(uid))
  const results = await env.DB.batch(queries)
  if (object(mem) && (mem.action === 'edit' || mem.action === 'forget') && results[2].meta.changes === 0)
    return fail(404, 'MEMORY_NOT_FOUND')
  if (object(mem) && mem.action === 'add' && results[2].meta.changes === 0) return fail(409, 'MEMORY_EXISTS_OR_LIMIT')
  return state(env, uid, day)
})

export function readCopilotContext(raw: unknown): CopilotContext {
  if (!object(raw)) return {}
  return { trackId: string(raw.trackId, 120), planetId: string(raw.planetId, 120), view: string(raw.view, 48) }
}
function recentMood(text: string) {
  return text.match(
    /(?:今天|现在|这会儿|这几天|最近|这两天|此刻|心情|感到|感觉|我有点|我很)[^。！？\n]{0,18}(?:疲惫|低落|开心|难过|焦虑|紧张|累|兴奋|平静|伤心|失眠|压力大|烦躁|不好|不错)|我(?:很|有点)?(?:疲惫|低落|开心|难过|焦虑|紧张|累|兴奋|伤心|失眠|压力大|烦躁)/,
  )
}
function extractMemory(text: string) {
  if (/不要记|不用记|别记|忘掉|忘记|是否|如果|[？?]|我(?:最)?喜欢什么/.test(text)) return null
  const mood = recentMood(text)
  if (mood) return { kind: 'mood', text: mood[0], expires: new Date(Date.now() + week).toISOString() }
  const likes = text.match(
    /(?:请?记住[，,:： ]*|我(?:一直|通常|平时|最)?(?:喜欢听|偏爱|爱听|不喜欢听|喜欢|不喜欢))([^。！？，,\n]{1,80})/,
  )
  if (
    !likes ||
    /记住吗|是不是/.test(text) ||
    (!/记住/.test(text) &&
      !/听|歌|音|曲|风格|节奏|爵士|摇滚|电子|民谣|古典|嘻哈|流行|吉他|钢琴|jazz|rock|ambient|pop|lo.fi|folk/i.test(
        likes[0],
      ))
  )
    return null
  return { kind: 'preference', text: likes[0].replace(/^请?记住[，,:： ]*/, ''), expires: null }
}
async function previousReply(env: Env, uid: string, row: TurnRow, text: string) {
  if (row.user_text !== text) return fail(409, 'REQUEST_ID_REUSED')
  return {
    requestId: row.request_id,
    messages: await refreshMessages(env, uid, messagesFor(row)),
    memories: await memories(env, uid),
  }
}

export const onRequestPost = endpoint(async (env, uid, request) => {
  const now = Date.now()
  const day = currentDayRange(request, now)
  const input = await bodyJson(request),
    text = string(input.text, 1600),
    requestId = string(input.requestId, 96)
  if (!text || !/^[a-zA-Z0-9_-]{1,96}$/.test(requestId)) return fail(400, 'INVALID_TURN')
  const provider = (input.provider ?? 'platform') as CopilotProvider
  if (!['platform', 'openai', 'anthropic'].includes(provider)) return fail(400, 'INVALID_PROVIDER')
  const key = string(request.headers.get('X-Mosic-Provider-Key'), 600)
  if (provider !== 'platform' && (!key || /[^!-~]/.test(key))) return fail(400, 'PROVIDER_KEY_REQUIRED')
  const model = string(input.model, 96)
  if ((input.model && (!model || !/^[A-Za-z0-9._-]+$/.test(model))) || 'apiKey' in input)
    return fail(400, 'INVALID_MODEL_SETTINGS')
  const find = () =>
    env.DB.prepare('SELECT * FROM music_copilot_turns WHERE user_id=? AND request_id=?')
      .bind(uid, requestId)
      .first<TurnRow>()
  const old = await find()
  if (old) return previousReply(env, uid, old, text)
  const lock = crypto.randomUUID()
  // Also limit fallback-only writes when the deployment has no model binding.
  const count = await env.DB.prepare('SELECT count(*) AS n FROM music_copilot_turns WHERE user_id=? AND created_at>?')
    .bind(uid, new Date(now - 60000).toISOString())
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= 15) return fail(429, 'TURN_RATE_LIMIT')
  const [, claimed] = await env.DB.batch([
    ensureProfile(env, uid),
    env.DB.prepare(
      `UPDATE music_copilot_profiles SET active_request=?,active_until=?
    WHERE user_id=? AND (active_request IS NULL OR active_until<?) AND NOT EXISTS (SELECT 1 FROM music_copilot_turns WHERE user_id=? AND request_id=?)`,
    ).bind(lock, now + 60000, uid, now, uid, requestId),
  ])
  if (!claimed.meta.changes) {
    const done = await find()
    if (done) return previousReply(env, uid, done, text)
    return fail(409, 'TURN_IN_PROGRESS')
  }
  try {
    const p = await profile(env, uid),
      m = p.settings.memoryEnabled ? await memories(env, uid) : []
    const raw = (await historyPage(env, uid, day, null, p.version)).rows.flatMap(messagesFor)
    const history = await refreshMessages(env, uid, raw),
      context = readCopilotContext(input.context)
    const facts = await copilotFacts(env, uid, text, context, history, m)
    const labels = facts.cards.map((c) => (c.type === 'track' ? '《' + c.track.title + '》' : c.displayName))
    const currentMemory = extractMemory(text)
    const focusAnswer =
      facts.focused && !facts.playTrackId && /BPM|节奏|速度|多快|歌手|谁唱|谁的|什么风格|什么歌/i.test(text)
        ? [
            '《' + facts.focused.title + '》来自 ' + facts.focused.artistName + '。',
            /BPM|节奏|速度|多快/i.test(text)
              ? facts.focused.visualFeatures?.tempoBpm
                ? '曲库标注为 ' + facts.focused.visualFeatures.tempoBpm + ' BPM。'
                : '曲库暂缺实测 BPM。'
              : '',
            /风格/.test(text) && facts.focused.genres.length
              ? '风格标签是 ' + facts.focused.genres.join('、') + '。'
              : '',
          ].join('')
        : ''
    const fallback = [
      facts.detail,
      focusAnswer ||
        (labels.length
          ? (facts.cards[0].type === 'planet' ? '可以去看看' : '给你挑了') + labels.join('、') + '。'
          : currentMemory && p.settings.memoryEnabled
            ? currentMemory.kind === 'mood'
              ? '收到，最近的心情只记七天。'
              : '收到，我记下了你的偏好。'
            : /记得|记住了什么|我的偏好/.test(text) && m.length
              ? '你留下的偏好有：' +
                m
                  .map((x) => x.text)
                  .slice(0, 3)
                  .join('、') +
                '。'
              : '我可以按你想听的风格、节奏或心情查曲库，也可以陪你逛公开星球。'),
    ]
      .filter(Boolean)
      .join(' ')
    const modelFacts = {
      view: context.view,
      currentTrack: facts.focused
        ? {
            title: facts.focused.title,
            artist: facts.focused.artistName,
            genres: facts.focused.genres,
            moods: facts.focused.moodTags,
            bpm: facts.focused.visualFeatures?.tempoBpm ?? null,
          }
        : null,
      currentPlanet: facts.contextPlanet?.name,
      candidates: facts.cards.map((c) =>
        c.type === 'track'
          ? { title: c.track.title, artist: c.track.artistName, reason: c.reason, source: c.source }
          : { name: c.displayName, reason: c.reason },
      ),
      notice: facts.detail,
      memory: m.map((x) => x.text),
      memoryEnabled: p.settings.memoryEnabled,
    }
    const reply = await speak(env, uid, provider, key, model, text, p.settings, history, modelFacts, fallback)
    const date = new Date(now).toISOString(),
      draft: CopilotMessage = {
        id: requestId + '-a',
        role: 'assistant',
        createdAt: date,
        ...reply,
        cards: facts.cards,
        ...(facts.playTrackId ? { playTrackId: facts.playTrackId } : {}),
      }
    const [msg] = await refreshMessages(env, uid, [draft])
    const check = 'EXISTS (SELECT 1 FROM music_copilot_profiles WHERE user_id=?1 AND active_request=?2)'
    const ops = [
      env.DB.prepare(
        `INSERT INTO music_copilot_turns(user_id,request_id,context_version,user_text,assistant_json,created_at)
      SELECT ?1,?3,?4,?5,?6,?7 WHERE ${check}`,
      ).bind(uid, lock, requestId, p.version, text, JSON.stringify(msg), date),
    ]
    if (p.settings.memoryEnabled && currentMemory)
      ops.push(
        env.DB.prepare(
          `INSERT INTO music_copilot_memories(id,user_id,text,kind,expires_at,updated_at)
      SELECT ?3,?1,?4,?5,?6,?7 WHERE ${check} AND (SELECT count(*) FROM music_copilot_memories WHERE user_id=?1)<40
      ON CONFLICT(user_id,text) DO UPDATE SET updated_at=excluded.updated_at,expires_at=excluded.expires_at`,
        ).bind(uid, lock, crypto.randomUUID(), currentMemory.text, currentMemory.kind, currentMemory.expires, date),
      )
    ops.push(
      env.DB.prepare(
        'UPDATE music_copilot_profiles SET active_request=NULL,active_until=0 WHERE user_id=? AND active_request=?',
      ).bind(uid, lock),
    )
    const results = await env.DB.batch(ops)
    if (!results[0].meta.changes) return fail(409, 'CONTEXT_CHANGED')
    return {
      requestId,
      messages: [{ id: requestId + '-u', role: 'user', createdAt: date, text }, msg],
      memories: await memories(env, uid),
    }
  } finally {
    await env.DB.prepare(
      'UPDATE music_copilot_profiles SET active_request=NULL,active_until=0 WHERE user_id=? AND active_request=?',
    )
      .bind(uid, lock)
      .run()
  }
})
