import { json, safeText, session, withCookie, type Env } from '../../../_shared'
import { conflictCode, localDate, parseCheckIn, THEMES, type CheckInPayload, type PlanetRow } from '../../../_planet'
import { careCardInsert, makeCareCard, readCareCard } from '../../../_care'

type CreatePayload = CheckInPayload & { name?: unknown; tagline?: unknown }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const [rows, user] = await Promise.all([
    env.DB.prepare('SELECT * FROM user_planets WHERE user_id = ?1 ORDER BY created_at, id').bind(active.userId).all<PlanetRow>(),
    env.DB.prepare('SELECT last_planet_id FROM users WHERE id = ?1').bind(active.userId).first<{ last_planet_id: string | null }>(),
  ])
  return withCookie({ planets: rows.results, lastVisitedPlanetId: user?.last_planet_id ?? null }, active)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const payload = await json<CreatePayload>(request)
  const name = safeText(payload?.name, 40)
  const tagline = safeText(payload?.tagline, 120)
  const theme = payload?.theme
  const record = parseCheckIn(payload)
  if (!name || typeof theme !== 'string' || !THEMES.has(theme) || !record) {
    return withCookie({ error: 'INVALID_FIRST_DAY' }, active, 400)
  }
  const counts = await env.DB.prepare(`SELECT count(*) AS active_count,
    count(CASE WHEN theme = ?2 THEN 1 END) AS theme_count FROM user_planets
    WHERE user_id = ?1 AND archived_at IS NULL`).bind(active.userId, theme).first<{ active_count: number; theme_count: number }>()
  if ((counts?.active_count ?? 0) >= 6) return withCookie({ error: 'PLANET_LIMIT' }, active, 409)
  if ((counts?.theme_count ?? 0) > 0) return withCookie({ error: 'THEME_TAKEN' }, active, 409)

  const now = new Date().toISOString()
  const date = await localDate(env, active.userId)
  const planetId = crypto.randomUUID()
  const entryId = crypto.randomUUID()
  const careCard = makeCareCard({
    userId: active.userId, planetId, date,
    theme, mood: record.mood, intensity: record.intensity,
    triggers: JSON.parse(record.triggersJson) as string[],
  }, new Date(now))
  const billboardId = record.hasPublicContent ? record.billboardId || entryId : null
  const statements = [
    env.DB.prepare(`INSERT INTO user_planets
      (id, user_id, alias, tagline, theme, visual_seed, public_mood, intensity, message,
       music_url, doodle_json, visibility, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`)
      .bind(planetId, active.userId, name, tagline, theme, planetId, record.mood, record.intensity,
        record.publicMessage, record.musicUrl, record.doodleJson, record.privacy, now),
    env.DB.prepare(`INSERT INTO mood_entries
      (id, user_id, planet_id, billboard_id, date, theme, mood, intensity, triggers_json,
       private_note, public_message, privacy, music_url, doodle_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
      .bind(entryId, active.userId, planetId, billboardId, date, theme, record.mood, record.intensity,
        record.triggersJson, record.privateNote, record.publicMessage, record.privacy,
        record.musicUrl, record.doodleJson, now),
  ]
  if (billboardId) {
    statements.push(env.DB.prepare(`INSERT INTO planet_billboards
      (id, user_id, planet_id, kind, title, text, doodle_json, created_at)
      VALUES (?1, ?2, ?3, 'user', '', ?4, ?5, ?6)`)
      .bind(billboardId, active.userId, planetId, record.publicMessage, '[]', now))
  }
  statements.push(env.DB.prepare('UPDATE users SET last_planet_id = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(planetId, now, active.userId))
  statements.push(careCardInsert(env.DB, careCard))
  try {
    await env.DB.batch(statements)
  } catch (error) {
    const code = conflictCode(error)
    if (code) return withCookie({ error: code }, active, 409)
    throw error
  }
  const planet = await env.DB.prepare('SELECT * FROM user_planets WHERE id = ?1').bind(planetId).first<PlanetRow>()
  const savedCareCard = await readCareCard(env.DB, planetId, date)
  return withCookie({ ok: true, planet, entry: {
    id: entryId, planet_id: planetId, date, theme, mood: record.mood, intensity: record.intensity,
    triggers_json: record.triggersJson, private_note: record.privateNote, public_message: record.publicMessage,
    privacy: record.privacy, music_url: record.musicUrl, doodle_json: record.doodleJson,
    billboard_id: billboardId, created_at: now,
  }, careCard: savedCareCard }, active, 201)
}
