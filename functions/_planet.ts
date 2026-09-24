import { safeList, safeText, type Env } from './_shared'

export type PlanetRow = {
  id: string
  user_id: string
  alias: string
  tagline: string
  theme: string
  visual_seed: string
  public_mood: string
  intensity: number
  message: string
  music_url: string
  doodle_json: string
  visibility: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type EntryRow = {
  id: string
  user_id: string
  planet_id: string
  billboard_id: string | null
  date: string
  theme: string
  mood: string
  intensity: number
  triggers_json: string
  private_note: string
  public_message: string
  privacy: string
  music_url: string
  doodle_json: string
  created_at: string
}

export type CheckInPayload = {
  theme?: unknown
  mood?: unknown
  intensity?: unknown
  triggers?: unknown
  privateNote?: unknown
  publicMessage?: unknown
  privacy?: unknown
  musicUrl?: unknown
  doodle?: unknown
  billboardId?: unknown
}

export const THEMES = new Set([
  'study', 'career', 'court', 'lens', 'create', 'care', 'work_growth', 'job_search',
  'skill_building', 'intimacy', 'family', 'friendship', 'wellbeing', 'running',
  'exploration', 'reading_writing', 'music', 'fitness', 'gaokao', 'healthy_eating',
])
const MOODS = new Set([
  'joy', 'hope', 'calm', 'sad', 'anxious', 'tired', 'irritable', 'anger', 'lonely',
  'hurt', 'confused', 'relieved', 'grateful', 'content', 'numb', 'fear', 'proud', 'unnamed',
])
const PRIVACY = new Set(['private', 'mood_theme_public', 'billboard_public'])

export function parseCheckIn(payload: CheckInPayload | null) {
  if (!payload || typeof payload.mood !== 'string' || !MOODS.has(payload.mood)) return null
  const privacy = payload.privacy === undefined ? 'private' : payload.privacy
  if (typeof privacy !== 'string' || !PRIVACY.has(privacy)) return null
  const intensity = Number(payload.intensity)
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > 5) return null
  const doodle = Array.isArray(payload.doodle) ? payload.doodle.slice(0, 200) : []
  const doodleJson = JSON.stringify(doodle)
  if (doodleJson.length > 50000) return null
  const publicMessage = privacy === 'billboard_public'
    ? Array.from(safeText(payload.publicMessage, 1000)).slice(0, 500).join('')
    : ''
  return {
    mood: payload.mood,
    intensity,
    privacy,
    triggersJson: JSON.stringify(safeList(payload.triggers, 8)),
    privateNote: safeText(payload.privateNote, 600),
    publicMessage,
    musicUrl: safeText(payload.musicUrl, 240),
    doodleJson,
    hasPublicContent: privacy === 'billboard_public' && Boolean(publicMessage),
    billboardId: safeText(payload.billboardId, 80),
  }
}

export async function ownedPlanet(env: Env, userId: string, id: string, includeArchived = false) {
  return env.DB.prepare(`SELECT * FROM user_planets WHERE id = ?1 AND user_id = ?2${includeArchived ? '' : ' AND archived_at IS NULL'}`)
    .bind(id, userId).first<PlanetRow>()
}

export async function preferredPlanet(env: Env, userId: string) {
  return env.DB.prepare(`SELECT p.* FROM user_planets p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?1 AND p.archived_at IS NULL
    ORDER BY CASE WHEN p.id = u.last_planet_id THEN 0 ELSE 1 END, p.created_at, p.id LIMIT 1`)
    .bind(userId).first<PlanetRow>()
}

export async function localDate(env: Env, userId: string, at = new Date()) {
  const user = await env.DB.prepare('SELECT timezone FROM users WHERE id = ?1').bind(userId).first<{ timezone: string }>()
  const timezone = user?.timezone || 'Asia/Shanghai'
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  } catch {
    parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  }
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function conflictCode(error: unknown): 'PLANET_LIMIT' | 'THEME_TAKEN' | 'DAILY_ENTRY_EXISTS' | null {
  const message = String(error)
  if (message.includes('PLANET_LIMIT')) return 'PLANET_LIMIT'
  if (message.includes('user_planets.user_id, user_planets.theme') || message.includes('user_planets_active_theme')) return 'THEME_TAKEN'
  if (message.includes('DAILY_ENTRY_EXISTS')) return 'DAILY_ENTRY_EXISTS'
  return null
}

export const publicPlanet = (row: PlanetRow, weatherHistory: Array<{ date: string; mood: string; intensity: number }> = []) => ({
  id: row.id,
  alias: row.alias,
  tagline: row.tagline,
  theme: row.theme,
  mood: row.public_mood,
  intensity: row.intensity,
  message: row.visibility === 'billboard_public' ? row.message : '',
  musicUrl: row.visibility === 'billboard_public' ? row.music_url : '',
  doodle: row.visibility === 'billboard_public' ? parseDoodle(row.doodle_json) : [],
  visual_seed: row.visual_seed === 'self' ? row.id : row.visual_seed,
  weather_history: weatherHistory,
  updated_at: row.updated_at,
})

export function parseDoodle(value: string) {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
