import { authenticatedMusicUser, type Env } from '../../../_shared'
import { readPlanetDitherVisuals } from '../../../_music-dither'

/** Compatibility endpoint for preceding clients; never queues appearance AI.
 * Authoritative writes occur atomically in music-planet POST/PATCH. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)
  const row = await env.DB.prepare('SELECT id, visual_json FROM music_planets WHERE owner_user_id=?1')
    .bind(identity.userId).first<{ id: string; visual_json: string }>()
  if (!row) return respond({ error: 'PLANET_NOT_FOUND' }, 404)
  const visuals = await readPlanetDitherVisuals(env, [row])
  return respond({ visual: visuals.get(row.id), visualSchemaVersion: 3, mode: 'deterministic' })
}
