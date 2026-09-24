import { json, session, withCookie, type Env } from '../../../../../_shared'
import { localDate, ownedPlanet, parseCheckIn, type CheckInPayload, type EntryRow, type PlanetRow } from '../../../../../_planet'

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const planetId = String(params.id ?? '')
  const entryId = String(params.entryId ?? '')
  const planet = await ownedPlanet(env, active.userId, planetId, true)
  if (!planet) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  if (planet.archived_at) return withCookie({ error: 'PLANET_ARCHIVED' }, active, 409)
  const existing = await env.DB.prepare(`SELECT * FROM mood_entries
    WHERE id = ?1 AND planet_id = ?2 AND user_id = ?3`)
    .bind(entryId, planetId, active.userId).first<EntryRow>()
  if (!existing) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  if (existing.date !== await localDate(env, active.userId)) {
    return withCookie({ error: 'PAST_ENTRY_READ_ONLY' }, active, 409)
  }
  const payload = await json<CheckInPayload>(request)
  const record = parseCheckIn(payload)
  if (!record) return withCookie({ error: 'INVALID_CHECK_IN' }, active, 400)
  if (payload?.theme !== undefined && payload.theme !== planet.theme) {
    return withCookie({ error: 'THEME_LOCKED' }, active, 409)
  }
  const oldBillboard = existing.billboard_id
    ? await env.DB.prepare('SELECT id FROM planet_billboards WHERE id = ?1 AND planet_id = ?2 AND user_id = ?3')
      .bind(existing.billboard_id, planetId, active.userId).first<{ id: string }>()
    : null
  const billboardId = record.hasPublicContent ? oldBillboard?.id || crypto.randomUUID() : null
  const now = new Date().toISOString()
  const statements = [
    env.DB.prepare(`UPDATE mood_entries SET billboard_id = ?1, mood = ?2, intensity = ?3,
      triggers_json = ?4, private_note = ?5, public_message = ?6, privacy = ?7,
      music_url = ?8, doodle_json = ?9
      WHERE id = ?10 AND planet_id = ?11 AND user_id = ?12`)
      .bind(billboardId, record.mood, record.intensity, record.triggersJson,
        record.privateNote, record.publicMessage, record.privacy, record.musicUrl,
        record.doodleJson, entryId, planetId, active.userId),
  ]
  if (oldBillboard && !billboardId) {
    statements.push(env.DB.prepare('DELETE FROM planet_billboards WHERE id = ?1 AND planet_id = ?2 AND user_id = ?3')
      .bind(oldBillboard.id, planetId, active.userId))
  }
  if (billboardId) {
    statements.push(env.DB.prepare(`INSERT INTO planet_billboards
      (id, user_id, planet_id, kind, title, text, doodle_json, created_at)
      VALUES (?1, ?2, ?3, 'user', '', ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET text = excluded.text, doodle_json = excluded.doodle_json
      WHERE user_id = excluded.user_id AND planet_id = excluded.planet_id`)
      .bind(billboardId, active.userId, planetId, record.publicMessage, '[]', existing.created_at))
  }
  statements.push(env.DB.prepare(`UPDATE user_planets SET
    public_mood = (SELECT mood FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    intensity = (SELECT intensity FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    message = (SELECT CASE WHEN privacy = 'billboard_public' THEN public_message ELSE '' END
      FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    music_url = (SELECT music_url FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    doodle_json = (SELECT doodle_json FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    visibility = (SELECT privacy FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1),
    updated_at = ?2 WHERE id = ?1 AND user_id = ?3 AND archived_at IS NULL`)
    .bind(planetId, now, active.userId))
  await env.DB.batch(statements)
  const [entry, updated] = await Promise.all([
    env.DB.prepare('SELECT * FROM mood_entries WHERE id = ?1 AND user_id = ?2').bind(entryId, active.userId).first<EntryRow>(),
    env.DB.prepare('SELECT * FROM user_planets WHERE id = ?1 AND user_id = ?2').bind(planetId, active.userId).first<PlanetRow>(),
  ])
  return withCookie({ ok: true, entry, planet: updated }, active)
}
