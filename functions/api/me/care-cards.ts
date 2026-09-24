import { json, session, withCookie, type Env } from '../../_shared'
import { ownedPlanet, preferredPlanet } from '../../_planet'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const id = new URL(request.url).searchParams.get('planetId') || (await preferredPlanet(env, active.userId))?.id
  if (!id || !await ownedPlanet(env, active.userId, id, true)) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const rows = await env.DB.prepare(`SELECT id, planet_id AS planetId, title, message, action, published,
    created_at AS createdAt, expires_at AS expiresAt FROM care_cards
    WHERE user_id = ?1 AND planet_id = ?2 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 30`).bind(active.userId, id).all()
  return withCookie({ cards: rows.results }, active)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const body = await json<{ id?: string; planetId?: string; published?: boolean }>(request)
  if (!body?.id) return withCookie({ error: 'INVALID_CARD' }, active, 400)
  const planetId = body.planetId || (await preferredPlanet(env, active.userId))?.id
  const planet = planetId ? await ownedPlanet(env, active.userId, planetId, true) : null
  if (!planet) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  if (planet.archived_at && body.published) return withCookie({ error: 'PLANET_ARCHIVED' }, active, 409)
  const result = await env.DB.prepare(`UPDATE care_cards SET published = ?1
    WHERE id = ?2 AND user_id = ?3 AND planet_id = ?4`)
    .bind(body.published ? 1 : 0, body.id, active.userId, planet.id).run()
  if (!result.meta.changes) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  return withCookie({ ok: true }, active)
}
