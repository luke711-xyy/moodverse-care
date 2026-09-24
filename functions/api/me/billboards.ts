import { session, withCookie, type Env } from '../../_shared'
import { ownedPlanet, preferredPlanet } from '../../_planet'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const id = new URL(request.url).searchParams.get('planetId') || (await preferredPlanet(env, active.userId))?.id
  if (!id || !await ownedPlanet(env, active.userId, id, true)) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const rows = await env.DB.prepare(`SELECT id, kind, title, text, created_at AS createdAt, expires_at AS expiresAt
    FROM planet_billboards WHERE user_id = ?1 AND planet_id = ?2 AND trim(text) != '' ORDER BY created_at DESC LIMIT 365`)
    .bind(active.userId, id).all()
  return withCookie({ billboards: rows.results }, active)
}
