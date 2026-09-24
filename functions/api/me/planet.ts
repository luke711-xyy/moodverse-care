import { json, safeText, session, withCookie, type Env } from '../../_shared'
import { ownedPlanet, preferredPlanet } from '../../_planet'

// Compatibility endpoint for clients that still expect one current planet.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  return withCookie({ planet: await preferredPlanet(env, active.userId) }, active)
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const body = await json<{ alias?: unknown; name?: unknown; tagline?: unknown; planetId?: unknown }>(request)
  if (!body) return withCookie({ error: 'INVALID_BODY' }, active, 400)
  const id = typeof body.planetId === 'string' ? body.planetId : (await preferredPlanet(env, active.userId))?.id
  const planet = id ? await ownedPlanet(env, active.userId, id) : null
  if (!planet) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const alias = body.name === undefined && body.alias === undefined ? planet.alias : safeText(body.name ?? body.alias, 40)
  if (!alias) return withCookie({ error: 'INVALID_NAME' }, active, 400)
  const tagline = body.tagline === undefined ? planet.tagline : safeText(body.tagline, 120)
  await env.DB.prepare('UPDATE user_planets SET alias = ?1, tagline = ?2, updated_at = ?3 WHERE id = ?4 AND user_id = ?5')
    .bind(alias, tagline, new Date().toISOString(), planet.id, active.userId).run()
  return withCookie({ ok: true, planet: await ownedPlanet(env, active.userId, planet.id) }, active)
}
