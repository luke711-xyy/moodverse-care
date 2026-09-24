import { session, withCookie, type Env } from '../../../_shared'
import { ownedPlanet, preferredPlanet } from '../../../_planet'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const id = String(params.id ?? '')
  const planetId = new URL(request.url).searchParams.get('planetId') || (await preferredPlanet(env, active.userId))?.id
  if (!planetId || !await ownedPlanet(env, active.userId, planetId, true)) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const billboard = await env.DB.prepare('SELECT id FROM planet_billboards WHERE id = ?1 AND user_id = ?2 AND planet_id = ?3')
    .bind(id, active.userId, planetId).first()
  if (!billboard) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM planet_billboards WHERE id = ?1 AND user_id = ?2 AND planet_id = ?3')
      .bind(id, active.userId, planetId),
    env.DB.prepare('UPDATE mood_entries SET billboard_id = NULL WHERE billboard_id = ?1 AND planet_id = ?2 AND user_id = ?3')
      .bind(id, planetId, active.userId),
    env.DB.prepare(`UPDATE user_planets SET message = ''
      WHERE id = ?1 AND user_id = ?2 AND visibility = 'billboard_public'
      AND (SELECT billboard_id FROM mood_entries WHERE planet_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1) IS NULL`)
      .bind(planetId, active.userId),
  ])
  return withCookie({ ok: true }, active)
}
