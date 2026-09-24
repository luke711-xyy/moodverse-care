import { session, withCookie, type Env } from '../../_shared'
import { ownedPlanet, preferredPlanet, type EntryRow } from '../../_planet'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const url = new URL(request.url)
  const id = url.searchParams.get('planetId') || (await preferredPlanet(env, active.userId))?.id
  if (!id || !await ownedPlanet(env, active.userId, id, true)) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const range = url.searchParams.get('range')
  const limit = range === '7d' ? 7 : range === '30d' ? 30 : range === '1y' ? 365 : null
  const sql = `SELECT id, planet_id, billboard_id, date, theme, mood, intensity, triggers_json,
    private_note, public_message, privacy, music_url, doodle_json, created_at
    FROM mood_entries WHERE user_id = ?1 AND planet_id = ?2 ORDER BY date DESC, created_at DESC, id DESC`
  const rows = limit
    ? await env.DB.prepare(`${sql} LIMIT ?3`).bind(active.userId, id, limit).all<EntryRow>()
    : await env.DB.prepare(sql).bind(active.userId, id).all<EntryRow>()
  return withCookie({ entries: rows.results, planetId: id }, active)
}
