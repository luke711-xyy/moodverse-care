import { json, session, withCookie, type Env } from '../../_shared'
import { conflictCode, localDate, ownedPlanet, parseCheckIn, preferredPlanet, type CheckInPayload, type PlanetRow } from '../../_planet'
import { careCardInsert, makeCareCard, readCareCard } from '../../_care'

type Payload = CheckInPayload & { planetId?: unknown }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const payload = await json<Payload>(request)
  const record = parseCheckIn(payload)
  if (!record) return withCookie({ error: 'INVALID_CHECK_IN' }, active, 400)
  const planetId = typeof payload?.planetId === 'string' ? payload.planetId : (await preferredPlanet(env, active.userId))?.id
  const planet = planetId ? await ownedPlanet(env, active.userId, planetId, true) : null
  if (!planet) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  if (planet.archived_at) return withCookie({ error: 'PLANET_ARCHIVED' }, active, 409)
  if (payload?.theme !== undefined && payload.theme !== planet.theme) return withCookie({ error: 'THEME_LOCKED' }, active, 409)
  const now = new Date().toISOString()
  const date = await localDate(env, active.userId)
  const careCard = makeCareCard({
    userId: active.userId, planetId: planet.id, date,
    theme: planet.theme, mood: record.mood, intensity: record.intensity,
    triggers: JSON.parse(record.triggersJson) as string[],
  }, new Date(now))
  const entryId = crypto.randomUUID()
  const billboardId = record.hasPublicContent ? record.billboardId || entryId : null
  const statements = [
    env.DB.prepare(`INSERT INTO mood_entries
      (id, user_id, planet_id, billboard_id, date, theme, mood, intensity, triggers_json,
       private_note, public_message, privacy, music_url, doodle_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
      .bind(entryId, active.userId, planet.id, billboardId, date, planet.theme, record.mood,
        record.intensity, record.triggersJson, record.privateNote, record.publicMessage,
        record.privacy, record.musicUrl, record.doodleJson, now),
  ]
  if (billboardId) {
    statements.push(env.DB.prepare(`INSERT INTO planet_billboards
      (id, user_id, planet_id, kind, title, text, doodle_json, created_at)
      VALUES (?1, ?2, ?3, 'user', '', ?4, ?5, ?6)`)
      .bind(billboardId, active.userId, planet.id, record.publicMessage, '[]', now))
  }
  statements.push(env.DB.prepare(`UPDATE user_planets SET public_mood = ?1, intensity = ?2,
    message = ?3, music_url = ?4, doodle_json = ?5, visibility = ?6, updated_at = ?7
    WHERE id = ?8 AND user_id = ?9 AND archived_at IS NULL`)
    .bind(record.mood, record.intensity, record.publicMessage, record.musicUrl,
      record.doodleJson, record.privacy, now, planet.id, active.userId))
  statements.push(careCardInsert(env.DB, careCard, true))
  try {
    await env.DB.batch(statements)
  } catch (error) {
    const code = conflictCode(error)
    if (code) return withCookie({ error: code }, active, 409)
    throw error
  }
  const updated = await env.DB.prepare('SELECT * FROM user_planets WHERE id = ?1 AND user_id = ?2')
    .bind(planet.id, active.userId).first<PlanetRow>()
  const savedCareCard = await readCareCard(env.DB, planet.id, date)
  return withCookie({ ok: true, entry: {
    id: entryId, planet_id: planet.id, date, theme: planet.theme, mood: record.mood,
    intensity: record.intensity, triggers_json: record.triggersJson, private_note: record.privateNote,
    public_message: record.publicMessage, privacy: record.privacy, music_url: record.musicUrl,
    doodle_json: record.doodleJson, billboard_id: billboardId, created_at: now,
  }, planet: updated, careCard: savedCareCard }, active, 201)
}
