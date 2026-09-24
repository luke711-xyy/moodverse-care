import { json, safeText, session, withCookie, type Env } from '../../../_shared'
import { conflictCode, ownedPlanet, type PlanetRow } from '../../../_planet'

type Payload = { name?: unknown; tagline?: unknown; archived?: unknown }

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const id = String(params.id ?? '')
  const before = await ownedPlanet(env, active.userId, id, true)
  if (!before) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const body = await json<Payload>(request)
  if (!body || (body.archived !== undefined && typeof body.archived !== 'boolean')) {
    return withCookie({ error: 'INVALID_PLANET' }, active, 400)
  }
  const name = body.name === undefined ? before.alias : safeText(body.name, 40)
  const tagline = body.tagline === undefined ? before.tagline : safeText(body.tagline, 120)
  if (!name) return withCookie({ error: 'INVALID_NAME' }, active, 400)
  const archivedAt = body.archived === undefined ? before.archived_at
    : body.archived ? before.archived_at || new Date().toISOString() : null
  const now = new Date().toISOString()
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE user_planets SET alias = ?1, tagline = ?2, archived_at = ?3, updated_at = ?4
        WHERE id = ?5 AND user_id = ?6`).bind(name, tagline, archivedAt, now, id, active.userId),
      env.DB.prepare(`UPDATE users SET last_planet_id =
        (SELECT id FROM user_planets WHERE user_id = ?1 AND archived_at IS NULL ORDER BY created_at, id LIMIT 1)
        WHERE id = ?1 AND last_planet_id = ?2 AND ?3 IS NOT NULL`)
        .bind(active.userId, id, archivedAt),
    ])
  } catch (error) {
    const code = conflictCode(error)
    if (code) return withCookie({ error: code }, active, 409)
    throw error
  }
  const planet = await env.DB.prepare('SELECT * FROM user_planets WHERE id = ?1 AND user_id = ?2')
    .bind(id, active.userId).first<PlanetRow>()
  return withCookie({ ok: true, planet }, active)
}
