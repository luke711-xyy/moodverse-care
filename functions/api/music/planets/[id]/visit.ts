import { authenticatedMusicUser, json, type Env } from '../../../../_shared'
import { readPublicPlanet } from '../[id]'
import { decodePlanetRouteId } from '../_route'

type VisitSource = 'direct' | 'song_portal' | 'galaxy' | 'random_roam' | 'daily_roam' | 'orbit'
type VisitBody = { isIncognito?: unknown; source?: unknown; trackId?: unknown }

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
})

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const planetId = decodePlanetRouteId(params?.id)
  if (!planetId) return respond({ error: 'PLANET_NOT_FOUND' }, 404)

  const body = await json<VisitBody>(request)
  if (body && (typeof body !== 'object' || Array.isArray(body))) return respond({ error: 'INVALID_VISIT' }, 400)
  if (body && Object.prototype.hasOwnProperty.call(body, 'isIncognito') && typeof body.isIncognito !== 'boolean') {
    return respond({ error: 'INVALID_VISIT' }, 400)
  }
  const allowedSources = new Set<VisitSource>(['direct', 'song_portal', 'galaxy', 'random_roam', 'daily_roam', 'orbit'])
  const source = body?.source === undefined ? 'direct' : body.source
  if (typeof source !== 'string' || !allowedSources.has(source as VisitSource)) return respond({ error: 'INVALID_VISIT' }, 400)
  const trackId = source === 'song_portal' && typeof body?.trackId === 'string' ? body.trackId.trim() : ''
  if (source === 'song_portal' && (!trackId || trackId.length > 128)) return respond({ error: 'INVALID_VISIT' }, 400)
  if (source !== 'song_portal' && body?.trackId !== undefined) return respond({ error: 'INVALID_VISIT' }, 400)
  const isIncognito = body?.isIncognito === true ? 1 : 0
  const visitedAt = new Date().toISOString()
  const writes = [env.DB.prepare(`
    INSERT INTO music_planet_visits
      (planet_id, visitor_user_id, last_visited_at, is_incognito)
    SELECT p.id, ?2, ?4, ?3
    FROM music_planets p
    WHERE p.id = ?1 AND p.visibility = 'public' AND p.owner_user_id <> ?2
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?2 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?2)
      )
    ON CONFLICT(planet_id, visitor_user_id) DO UPDATE SET
      last_visited_at = excluded.last_visited_at,
      is_incognito = excluded.is_incognito
  `).bind(planetId, identity.userId, isIncognito, visitedAt)]
  if (source === 'song_portal') {
    writes.push(env.DB.prepare(`
      INSERT INTO music_song_encounters
        (visitor_user_id, planet_id, track_id, first_encountered_at, last_encountered_at)
      SELECT ?2, p.id, c.id, ?4, ?4
      FROM music_planets p
      JOIN music_track_catalog c ON c.id = ?3 AND c.is_active = 1
      WHERE p.id = ?1 AND p.visibility = 'public' AND p.owner_user_id <> ?2
        AND (
          EXISTS (SELECT 1 FROM music_planet_tracks t WHERE t.planet_id = p.id AND t.track_id = c.id)
          OR EXISTS (
            SELECT 1 FROM music_moments m
            WHERE m.planet_id = p.id AND m.track_id = c.id
              AND m.visibility = 'public' AND m.published_at IS NOT NULL
          )
        )
        AND EXISTS (
          SELECT 1 FROM music_planets own_planet
          WHERE own_planet.owner_user_id = ?2
            AND (
              EXISTS (SELECT 1 FROM music_planet_tracks t WHERE t.planet_id = own_planet.id AND t.track_id = c.id)
              OR EXISTS (
                SELECT 1 FROM music_moments m
                WHERE m.planet_id = own_planet.id AND m.track_id = c.id
                  AND m.visibility = 'public' AND m.published_at IS NOT NULL
              )
            )
        )
      ON CONFLICT(visitor_user_id, planet_id, track_id) DO UPDATE SET
        last_encountered_at = excluded.last_encountered_at
    `).bind(planetId, identity.userId, trackId, visitedAt))
  }
  const writesResult = await env.DB.batch(writes)
  if (writesResult[0]?.meta.changes < 1) return respond({ error: 'PLANET_NOT_FOUND' }, 404)

  const planet = await readPublicPlanet(env, planetId, identity.userId)
  return planet ? respond({ planet }) : respond({ error: 'PLANET_NOT_FOUND' }, 404)
}
