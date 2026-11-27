import { authenticatedMusicUser, withCookie, type Env } from './_shared'
import {
  defaultCopilotSettings,
  type CopilotMemory,
  type CopilotMessage,
  type CopilotSettings,
} from '../src/music/copilot/contracts'

export class CopilotError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}
export const fail = (status: number, code: string): never => {
  throw new CopilotError(status, code)
}
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export const string = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length <= max ? v.trim() : '')
export const week = 7 * 86400000
export async function limitedBody(request: Pick<Request, 'headers' | 'body'>, max: number) {
  if (Number(request.headers.get('content-length') ?? 0) > max) fail(413, 'INPUT_TOO_LARGE')
  const reader = request.body?.getReader()
  if (!reader) fail(400, 'EMPTY_BODY')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader!.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader!.cancel()
      fail(413, 'INPUT_TOO_LARGE')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
export async function bodyJson(request: Request) {
  const bytes = await limitedBody(request, 10000)
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (object(value)) return value
  } catch {
    /* invalid client input */
  }
  return fail(400, 'INVALID_BODY')
}
type Result = unknown | Response
export function endpoint(fn: (env: Env, userId: string, request: Request) => Promise<Result>): PagesFunction<Env> {
  return async ({ env, request }) => {
    const identity = await authenticatedMusicUser(request, env)
    if (!identity) return withCookie({ error: 'UNAUTHENTICATED' }, { setCookie: null }, 401)
    try {
      const result = await fn(env, identity.userId, request)
      if (result instanceof Response) {
        result.headers.set('Cache-Control', 'private, no-store')
        if (identity.setCookie) result.headers.set('Set-Cookie', identity.setCookie)
        return result
      }
      return withCookie(result, identity)
    } catch (e) {
      return withCookie(
        { error: e instanceof CopilotError ? e.code : 'COPILOT_UNAVAILABLE' },
        identity,
        e instanceof CopilotError ? e.status : 503,
      )
    }
  }
}

type ProfileRow = {
  name: string
  personality: CopilotSettings['personality']
  proactivity: CopilotSettings['proactivity']
  memory_enabled: number
  voice_enabled: number
  context_version: number
}
export async function profile(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT * FROM music_copilot_profiles WHERE user_id=?')
    .bind(userId)
    .first<ProfileRow>()
  const settings: CopilotSettings = row
    ? {
        name: row.name,
        personality: row.personality,
        proactivity: row.proactivity,
        memoryEnabled: !!row.memory_enabled,
        voiceEnabled: !!row.voice_enabled,
      }
    : { ...defaultCopilotSettings }
  return { settings, version: row?.context_version ?? 0 }
}
export async function memories(env: Env, userId: string) {
  return (
    await env.DB.prepare(
      `SELECT id,text,kind,expires_at AS expiresAt FROM music_copilot_memories WHERE user_id=?
    AND (expires_at IS NULL OR expires_at>?) ORDER BY updated_at DESC,id LIMIT 40`,
    )
      .bind(userId, new Date().toISOString())
      .all<CopilotMemory>()
  ).results
}
export type TurnRow = {
  request_id: string
  user_text: string
  assistant_json: string
  created_at: string
  context_version: number
}
export function currentDayRange(request: Request, now = Date.now()) {
  const timeZone = request.headers.get('X-Mosic-Time-Zone') || 'UTC'
  let calendar: Intl.DateTimeFormat
  try {
    calendar = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' })
  } catch {
    return fail(400, 'INVALID_TIME_ZONE')
  }
  const today = calendar.format(now)
  // Locate the first second of this local date, including dates with a midnight offset change.
  let low = Math.floor(now / 1000) - 48 * 3600
  let high = Math.floor(now / 1000)
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (calendar.format(middle * 1000) === today) high = middle
    else low = middle + 1
  }
  return { start: new Date(low * 1000).toISOString(), end: new Date(now + 1).toISOString() }
}
export async function historyPage(
  env: Env, userId: string, range: { start: string; end: string }, cursor: string | null = null, version?: number,
) {
  const limit = 20
  const bounds: (string | number)[] = [userId, range.start, range.end]
  let criteria = 'user_id=? AND created_at>=? AND created_at<?'
  if (cursor !== null) {
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(cursor)) fail(400, 'INVALID_HISTORY_CURSOR')
    criteria += ` AND (created_at,rowid)<(SELECT created_at,rowid FROM music_copilot_turns WHERE user_id=? AND request_id=?)`
    bounds.push(userId, cursor)
  }
  if (version !== undefined) {
    criteria += ' AND context_version=?'
    bounds.push(version)
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM music_copilot_turns WHERE ${criteria} ORDER BY created_at DESC,rowid DESC LIMIT ?`,
  ).bind(...bounds, limit + 1).all<TurnRow>()
  const rows = results.slice(0, limit).reverse()
  return { rows, nextCursor: results.length > limit ? rows[0].request_id : null }
}
export function messagesFor(row: TurnRow): CopilotMessage[] {
  return [
    { id: row.request_id + '-u', role: 'user', text: row.user_text, createdAt: row.created_at },
    JSON.parse(row.assistant_json),
  ]
}
export const capabilities = (env: Env) => ({
  platform: false,
  stt: !!env.AI,
  tts: !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION),
})
export const ensureProfile = (env: Env, userId: string) =>
  env.DB.prepare('INSERT OR IGNORE INTO music_copilot_profiles(user_id) VALUES (?)').bind(userId)
export async function reserve(env: Env, userId: string, kind: 'platform' | 'byok' | 'stt' | 'tts') {
  const now = Date.now(),
    day = now - (now % 86400000)
  const limit = (v: string | undefined, fallback: number) =>
    v && /^\d+$/.test(v) ? Math.min(Number(v), 100000) : fallback
  const perUser = limit(env.MUSIC_COPILOT_DAILY_LIMIT, kind === 'platform' || kind === 'byok' ? 30 : 12)
  const global = limit(env.MUSIC_COPILOT_GLOBAL_DAILY_LIMIT, 250)
  const r = await env.DB.prepare(
    `INSERT INTO music_copilot_usage(user_id,kind,at)
    SELECT ?1,?2,?3 WHERE (SELECT count(*) FROM music_copilot_usage WHERE user_id=?1 AND kind=?2 AND at>=?4)<?5
    AND (?2='byok' OR (SELECT count(*) FROM music_copilot_usage WHERE kind=?2 AND at>=?4)<?6)`,
  )
    .bind(userId, kind, now, day, perUser, global)
    .run()
  return r.meta.changes > 0
}

// A bounded batch on the existing scheduler handles even accounts that never return.
export async function pruneCopilot(env: Pick<Env, 'DB'>, now = Date.now()) {
  const iso = new Date(now).toISOString()
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM music_copilot_memories WHERE rowid IN (SELECT rowid FROM music_copilot_memories WHERE expires_at IS NOT NULL AND expires_at<=? LIMIT 5000)',
    ).bind(iso),
    env.DB.prepare(
      'DELETE FROM music_copilot_usage WHERE id IN (SELECT id FROM music_copilot_usage WHERE at<? LIMIT 5000)',
    ).bind(now - 2 * 86400000),
  ])
}
