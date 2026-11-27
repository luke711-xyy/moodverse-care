import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { onRequestGet, onRequestPatch, onRequestPost } from '../functions/api/me/copilot'
import { onRequestPost as candidates } from '../functions/api/me/copilot/candidates'
import { onRequestPost as transcribe } from '../functions/api/me/copilot/transcribe'
import { onRequestPost as speech } from '../functions/api/me/copilot/speech'
import { onRequestGet as getHistory } from '../functions/api/me/copilot/history'
import { currentDayRange, pruneCopilot, week } from '../functions/_music-copilot-state'
import { createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
import type { Env } from '../functions/_shared'

let db: ReturnType<typeof createMusicApiFixture>, env: Env, cookie: string
async function call(
  handler: PagesFunction<Env>,
  data?: unknown,
  method = 'POST',
  who = cookie,
  headers: Record<string, string> = {},
) {
  const request = new Request('https://mosic.test/api/me/copilot', {
    method,
    headers: { Origin: 'https://mosic.test', Cookie: who, ...headers },
    ...(data === undefined ? {} : { body: data instanceof Uint8Array ? data : JSON.stringify(data) }),
  })
  return handler({ request, env } as never)
}
async function chat(text: string, requestId: string = crypto.randomUUID(), extra = {}) {
  const r = await call(onRequestPost, { text, requestId, ...extra })
  expect(r.status).toBe(200)
  return r.json() as Promise<any>
}
beforeEach(async () => {
  db = createMusicApiFixture()
  db.sqlite.exec(readFileSync(new URL('../migrations-music-staging/0007_copilot.sql', import.meta.url), 'utf8'))
  env = { DB: db.db }
  const first = await call(onRequestGet, undefined, 'GET', '')
  cookie = first.headers.get('Set-Cookie')!.split(';')[0]
})
afterEach(() => {
  db.close()
  vi.unstubAllGlobals()
})

function seedTrack(id: string, title: string, bpm: number, genre = 'Rock') {
  insertCatalogTrack(db.sqlite, { id, title })
  db.sqlite
    .prepare("UPDATE music_track_catalog SET provider='audius',genres_json=?,visual_features_json=? WHERE id=?")
    .run(JSON.stringify([genre]), JSON.stringify({ source: 'audius', tempoBpm: bpm }), id)
}
function archive(query: Record<string, string>, who = cookie) {
  const request = new Request('https://mosic.test/api/me/copilot/history?' + new URLSearchParams(query), {
    headers: { Cookie: who },
  })
  return getHistory({ env, request } as never)
}
function seedTurn(uid: string, id: string, createdAt: string, text = id) {
  db.sqlite.prepare('INSERT INTO music_copilot_turns VALUES (?,?,0,?,?,?)').run(uid, id, text,
    JSON.stringify({ id: id + '-a', role: 'assistant', text: '收到', createdAt }), createdAt)
}

test('the active conversation and its model context begin at local midnight', async () => {
  const timeZone = { 'X-Mosic-Time-Zone': 'America/New_York' }
  const midnight = currentDayRange(new Request('https://mosic.test', { headers: timeZone })).start
  const { ownerId } = await (await archive({ owner: '1' })).json()
  seedTurn(ownerId, 'yesterday', new Date(Date.parse(midnight) - 1).toISOString(), 'yesterday private song')
  seedTurn(ownerId, 'today', midnight, 'today favorite song')
  const state = await (await call(onRequestGet, undefined, 'GET', cookie, timeZone)).json()
  expect(state.messages.map((m: any) => m.id)).toEqual(['today-u', 'today-a'])
  const run = vi.fn(async () => ({ response: '好的' }))
  env.AI = { run }
  const chat = await call(onRequestPost, { text: '继续聊', requestId: 'after-midnight' }, 'POST', cookie, timeZone)
  expect(chat.status).toBe(200)
  expect(JSON.stringify(run.mock.calls)).toContain('today favorite song')
  expect(JSON.stringify(run.mock.calls)).not.toContain('yesterday private song')
  expect((await call(onRequestPatch, { clearHistory: true }, 'PATCH', cookie, { 'X-Mosic-Time-Zone': 'Bad/Zone' })).status).toBe(400)
  expect(db.sqlite.prepare('SELECT count(*) AS n FROM music_copilot_turns').get()).toEqual({ n: 3 })
})

test('local day boundaries handle daylight saving and sub-hour time zones', () => {
  function midnight(zone: string, instant: string) {
    return currentDayRange(new Request('https://mosic.test', { headers: { 'X-Mosic-Time-Zone': zone } }), Date.parse(instant)).start
  }
  expect(midnight('America/New_York', '2024-11-04T04:59:59Z')).toBe('2024-11-03T04:00:00.000Z')
  expect(midnight('America/New_York', '2024-03-11T03:59:59Z')).toBe('2024-03-10T05:00:00.000Z')
  expect(midnight('Asia/Kathmandu', '2024-12-31T18:15:00Z')).toBe('2024-12-31T18:15:00.000Z')
})

test('a reply completed after local midnight is archived with the preceding day’s question', async () => {
  const timeZone = { 'X-Mosic-Time-Zone': 'Asia/Singapore' }
  const sentAt = '2026-11-28T15:59:59.000Z', midnight = '2026-11-28T16:00:00.000Z'
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(Date.parse(sentAt))
    env.AI = { run: async () => {
      vi.setSystemTime(Date.parse(midnight) + 1000)
      return { response: '晚安' }
    } }
    const reply = await call(onRequestPost, { text: '晚安', requestId: 'night' }, 'POST', cookie, timeZone)
    expect(reply.status).toBe(200)
    expect((await reply.json()).messages.map((m: any) => m.createdAt)).toEqual([sentAt, sentAt])
    const current = await call(onRequestGet, undefined, 'GET', cookie, timeZone)
    expect((await current.json()).messages).toEqual([])
    const prior = await archive({ start: '2026-11-27T16:00:00.000Z', end: midnight })
    expect((await prior.json()).messages.map((m: any) => m.id)).toEqual(['night-u', 'night-a'])
  } finally {
    vi.useRealTimers()
  }
})

test('archive survives maintenance and pages complete turns across timestamp ties within the selected range', async () => {
  const { ownerId } = await (await archive({ owner: '1' })).json()
  const [start, end] = ['2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z']
  for (let row = 0; row < 24; row++) seedTurn(ownerId, 'r' + row, start)
  seedTurn(ownerId, 'next-year', end)
  const other = await call(onRequestGet, undefined, 'GET', '')
  const otherCookie = other.headers.get('Set-Cookie')!.split(';')[0]
  const otherId = (await (await archive({ owner: '1' }, otherCookie)).json()).ownerId
  seedTurn(otherId, 'peer', start)
  await pruneCopilot(env, Date.parse(end) + week)
  const latest = await (await archive({ start, end })).json()
  expect(latest.messages).toHaveLength(40)
  expect(latest.messages[0].id).toBe('r4-u')
  const older = await (await archive({ start, end, cursor: latest.nextCursor })).json()
  expect(older.messages.map((m: any) => m.id)).toEqual(['r0-u', 'r0-a', 'r1-u', 'r1-a', 'r2-u', 'r2-a', 'r3-u', 'r3-a'])
  expect(older.nextCursor).toBeNull()
  expect((await (await archive({ start, end, cursor: latest.nextCursor }, otherCookie)).json()).messages).toEqual([])
  expect((await archive({ start, end: start })).status).toBe(400)
  expect((await archive({ start, end: '2026-01-01T00:00:00Z' })).status).toBe(400)
  expect((await archive({ start: '2024-02-30T00:00:00Z', end })).status).toBe(400)
  await call(onRequestPatch, { settings: { name: '船载导航' } }, 'PATCH')
  await call(onRequestPatch, { memory: { action: 'add', text: '爱听民谣' } }, 'PATCH')
  const cleared = await (await call(onRequestPatch, { clearHistory: true }, 'PATCH')).json()
  expect(cleared).toMatchObject({ settings: { name: '船载导航' }, memories: [{ text: '爱听民谣' }], messages: [], nextCursor: null })
  expect((await (await archive({ start, end })).json()).messages).toEqual([])
  expect((await (await archive({ start, end }, otherCookie)).json()).messages.map((m: any) => m.id)).toEqual(['peer-u', 'peer-a'])
})
test('anonymous sessions isolate private turns, require same-origin writes and repeat valid idempotent replies', async () => {
  const text = '我喜欢听爵士'
  const first = await chat(text, 'same-id')
  expect(first.memories[0].text).toContain('爵士')
  expect((await chat(text, 'same-id')).messages).toEqual(first.messages)
  expect((await call(onRequestPost, { text: '其他', requestId: 'same-id' })).status).toBe(409)
  const fresh = await call(onRequestGet, undefined, 'GET', '')
  expect((await fresh.json()).messages).toEqual([])
  expect(
    (await call(onRequestPatch, { clearHistory: true }, 'PATCH', cookie, { Origin: 'https://foreign.test' })).status,
  ).toBe(401)
  expect((await (await call(onRequestGet, undefined, 'GET')).json()).messages).toHaveLength(2)
})
test('real song labels, BPM ordering, explicit ordinal playback and availability refresh', async () => {
  seedTrack('audius:A', '灯', 100)
  seedTrack('audius:B', '雨', 65)
  seedTrack('audius:C', '街', 146)
  insertCatalogTrack(db.sqlite, { id: 'inactive', active: false })
  const result = await chat('推荐慢一点的歌')
  const reply = result.messages[1]
  expect(reply.cards.map((c: any) => c.track.id)).toEqual(['audius:B', 'audius:A', 'audius:C'])
  expect(reply.cards[0].reason).toContain('65 BPM')
  expect(reply.playTrackId).toBeUndefined()
  const picked = await chat('播放第二首')
  expect(picked.messages[1].playTrackId).toBe('audius:A')
  db.sqlite.prepare('UPDATE music_track_catalog SET is_active=0 WHERE id=?').run('audius:A')
  expect(JSON.stringify((await (await call(onRequestGet, undefined, 'GET')).json()).messages)).not.toContain('audius:A')
  expect((await chat('推荐本周热门')).messages[1].text).toContain('无法核实')
})
test('factual lookup filters both block directions and visibility without storing the query', async () => {
  seedTrack('audius:X', '夜航', 75, 'Jazz')
  const me = (db.sqlite.prepare('SELECT id FROM users').get() as any).id
  for (const id of ['friend', 'private', 'blocker', 'blocked']) {
    db.sqlite.prepare("INSERT INTO users(id,token_hash,created_at,updated_at) VALUES (?,?,'t','t')").run(id, id)
    db.sqlite
      .prepare(
        "INSERT INTO music_planets(id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES (?,?,?,?, 't','t')",
      )
      .run(id, id, id, id === 'private' ? 'private' : 'public')
    db.sqlite.prepare("INSERT INTO music_planet_tracks VALUES (?, 'audius:X',0,1,'t')").run(id)
  }
  db.sqlite.prepare("INSERT INTO music_user_blocks VALUES (?,?,'t')").run(me, 'blocked')
  db.sqlite.prepare("INSERT INTO music_user_blocks VALUES (?,?,'t')").run('blocker', me)
  const r = await call(candidates, { kind: 'planet', genre: 'Jazz' })
  expect((await r.json()).cards.map((c: any) => c.planetId)).toEqual(['friend'])
  expect(db.sqlite.prepare('SELECT count(*) n FROM music_copilot_turns').get()).toEqual({ n: 0 })
})
test('forgetting removes prior prompt context, edits persist, expiring moods are swept', async () => {
  const m = (await chat('我喜欢听爵士')).memories[0]
  const changed = await call(onRequestPatch, { memory: { id: m.id, action: 'edit', text: '我偏爱民谣' } }, 'PATCH')
  expect((await changed.json()).memories[0].text).toBe('我偏爱民谣')
  await call(onRequestPatch, { memory: { id: m.id, action: 'forget' } }, 'PATCH')
  const run = vi.fn(async () => ({ choices: [{ message: { content: '好的。' } }] }))
  env.AI = { run }
  await chat('我喜欢什么？')
  expect(JSON.stringify(run.mock.calls)).not.toContain('爵士')
  expect(JSON.stringify(run.mock.calls)).not.toContain('民谣')
  const mood = await chat('我今天有点累')
  expect(mood.memories.some((m: any) => m.kind === 'mood' && m.expiresAt)).toBe(true)
  await pruneCopilot(env, Date.now() + week + 100)
  expect((await (await call(onRequestGet, undefined, 'GET')).json()).memories.some((m: any) => m.kind === 'mood')).toBe(
    false,
  )
})
test('session BYOK stays in provider headers, quotas atomically gate model calls', async () => {
  const fetcher = vi.fn(async () => Response.json({ content: [{ type: 'text', text: '我在。' }] }))
  vi.stubGlobal('fetch', fetcher)
  const secret = 'test-only-transient'
  const data = { text: '你好', requestId: 'byok', provider: 'anthropic' }
  const r = await call(onRequestPost, data, 'POST', cookie, { 'X-Mosic-Provider-Key': secret })
  const result = await r.json()
  expect(result.messages[1].source).toBe('anthropic')
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.anthropic.com/v1/messages',
    expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': secret }) }),
  )
  expect(JSON.stringify(db.sqlite.prepare('SELECT * FROM music_copilot_turns').all())).not.toContain(secret)
  env.MUSIC_COPILOT_DAILY_LIMIT = '1'
  env.AI = { run: vi.fn(async () => ({ choices: [{ message: { content: '收到' } }] })) }
  await chat('在吗')
  expect((await chat('再聊会')).messages[1]).toMatchObject({
    source: 'fallback',
    fallbackReason: expect.stringContaining('额度'),
  })
  expect(env.AI.run).toHaveBeenCalledTimes(1)
})
test.each([{ memory: { action: 'clear' } }, { clearHistory: true }])(
  'clearing data during an in-flight reply prevents stale messages and memories from being committed: %j', async (change) => {
  let started!: () => void, finish!: (v: unknown) => void
  const running = new Promise<void>((r) => {
    started = r
  })
  env.AI = {
    run: () => {
      started()
      return new Promise((r) => {
        finish = r
      })
    },
  }
  const first = call(onRequestPost, { text: '我喜欢听爵士', requestId: 'one' })
  await running
  expect((await call(onRequestPost, { text: '我喜欢摇滚', requestId: 'two' })).status).toBe(409)
  expect((await call(onRequestPatch, change, 'PATCH')).status).toBe(200)
  finish({ response: '好的' })
  expect((await first).status).toBe(409)
  const s = await (await call(onRequestGet, undefined, 'GET')).json()
  expect(s.memories).toHaveLength(0)
  expect(s.messages).toHaveLength(0)
})
test('voice gates providers, sends bounded ephemeral audio and escapes speech markup', async () => {
  expect((await call(transcribe, new Uint8Array(10))).status).toBe(503)
  const run = vi.fn(async () => ({ text: '试音' }))
  env.AI = { run }
  expect((await call(transcribe, new Uint8Array(10), 'POST', cookie, { 'content-type': 'text/html' })).status).toBe(415)
  const asr = await call(transcribe, new Uint8Array(10), 'POST', cookie, { 'content-type': 'audio/webm' })
  expect(await asr.json()).toEqual({ text: '试音' })
  expect(run.mock.calls[0]).toMatchObject({
    0: '@cf/openai/whisper-large-v3-turbo',
    1: { audio: btoa('\0'.repeat(10)), language: 'zh' },
  })
  expect((await call(speech, { text: '<hello>' })).status).toBe(503)
  env.AZURE_SPEECH_KEY = 'fake-test'
  env.AZURE_SPEECH_REGION = 'eastasia'
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
  vi.stubGlobal('fetch', fetcher)
  const tts = await call(speech, { text: '<hello>' })
  expect(tts.headers.get('content-type')).toBe('audio/mpeg')
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('eastasia.tts.speech.microsoft.com'),
    expect.objectContaining({ body: expect.stringContaining('&lt;hello&gt;') }),
  )
  expect(db.sqlite.prepare('SELECT count(*) n FROM music_copilot_turns').get()).toEqual({ n: 0 })
})

test('a changed genre excludes rejected tracks and weekly labels require the real trending feed', async () => {
  seedTrack('audius:ROCK', 'Rock signal', 160, 'Rock')
  seedTrack('audius:JAZZ', 'Jazz radio', 85, 'Jazz')
  const change = await chat('不要摇滚，改成爵士')
  expect(change.messages[1].cards.map((c: any) => c.track.id)).toEqual(['audius:JAZZ'])
  env.AUDIUS_API_KEY = 'test-only'
  const api = vi.fn(async () =>
    Response.json({
      data: [
        { id: 'Trend1', title: 'Real weekly record', user: { id: 'artist1', name: 'Band' }, genre: 'EDM', bpm: 122 },
      ],
    }),
  )
  vi.stubGlobal('fetch', api)
  const chart = await chat('本周热榜有什么歌？')
  expect(chart.messages[1].cards[0]).toMatchObject({ source: 'audius_weekly', track: { id: 'audius:Trend1' } })
  expect(String((api.mock.calls[0] as unknown[])[0])).toContain('/tracks/trending?time=week')
})
test('private or blocked planet cards are removed even if visibility changes during the model request', async () => {
  seedTrack('audius:X', '夜航', 75)
  db.sqlite.exec(
    "INSERT INTO users(id,token_hash,created_at,updated_at) VALUES ('peer','peer','t','t'); INSERT INTO music_planets(id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES ('planet','peer','海岛','public','t','t'); INSERT INTO music_planet_tracks VALUES ('planet','audius:X',0,1,'t')",
  )
  env.AI = {
    run: async () => {
      db.sqlite.exec("UPDATE music_planets SET visibility='private' WHERE id='planet'")
      return { response: '去海岛看看。' }
    },
  }
  const result = await chat('给我推荐一个星球')
  expect(result.messages[1].cards).toEqual([])
  expect(result.messages[1].text).not.toContain('海岛')
})

test('explicitly entered short-term moods always expire, including a manually edited preference', async () => {
  const added = await call(onRequestPatch, { memory: { action: 'add', text: '最近感觉很低落' } }, 'PATCH')
  const mood = (await added.json()).memories[0]
  expect(mood).toMatchObject({ kind: 'mood', expiresAt: expect.any(String) })
  const music = await call(onRequestPatch, { memory: { action: 'add', text: '爱听爵士' } }, 'PATCH')
  const id = (await music.json()).memories.find((m: any) => m.kind === 'preference').id
  const edit = await call(onRequestPatch, { memory: { action: 'edit', id, text: '我今天压力大' } }, 'PATCH')
  expect((await edit.json()).memories.filter((m: any) => m.kind === 'mood')).toHaveLength(2)
})
