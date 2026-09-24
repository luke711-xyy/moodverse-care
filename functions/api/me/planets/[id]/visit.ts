import { ownedPlanet } from '../../../../_planet'
import { session, withCookie, type Env } from '../../../../_shared'

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const id = String(params.id ?? '')
  if (!await ownedPlanet(env, active.userId, id)) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  await env.DB.prepare('UPDATE users SET last_planet_id = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(id, new Date().toISOString(), active.userId).run()
  return withCookie({ ok: true }, active)
}
