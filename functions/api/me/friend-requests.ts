import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { isSocialRecord, pairIsBlocked, pairIsFriends, socialResponse } from '../../_music-social'

type RequestRow = {
  id: string
  user_id: string
  planet_id: string | null
  display_name: string
  tagline: string
  status: 'pending' | 'rejected'
  created_at: string
}

async function requestsFor(env: Env, userId: string) {
  const [incoming, outgoing] = await Promise.all([
    env.DB.prepare(`
      SELECT r.id, r.requester_user_id AS user_id,
             p.id AS planet_id,
             CASE WHEN p.id IS NULL THEN '星球暂不可见' ELSE p.display_name END AS display_name,
             CASE WHEN p.id IS NULL THEN '' ELSE p.tagline END AS tagline,
             r.status, r.created_at
      FROM music_friend_requests r
      LEFT JOIN music_planets p ON p.owner_user_id = r.requester_user_id AND p.visibility = 'public'
      WHERE r.recipient_user_id = ?1 AND r.status = 'pending'
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 50
    `).bind(userId).all<RequestRow>(),
    env.DB.prepare(`
      SELECT r.id, r.recipient_user_id AS user_id,
             p.id AS planet_id,
             CASE WHEN p.id IS NULL THEN '星球暂不可见' ELSE p.display_name END AS display_name,
             CASE WHEN p.id IS NULL THEN '' ELSE p.tagline END AS tagline,
             r.status, r.created_at
      FROM music_friend_requests r
      LEFT JOIN music_planets p ON p.id = r.planet_id AND p.visibility = 'public'
      WHERE r.requester_user_id = ?1 AND r.status IN ('pending', 'rejected')
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 50
    `).bind(userId).all<RequestRow>(),
  ])
  const map = (row: RequestRow) => ({
    id: row.id,
    userId: row.user_id,
    planetId: row.planet_id,
    displayName: row.display_name,
    tagline: row.tagline,
    status: row.status,
    createdAt: row.created_at,
  })
  return { incoming: incoming.results.map(map), outgoing: outgoing.results.map(map) }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  return socialResponse(await requestsFor(env, identity.userId))
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const payload = await json<unknown>(request)
  const planetId = isSocialRecord(payload) && typeof payload.planetId === 'string' ? payload.planetId.trim() : ''
  if (!isSocialRecord(payload) || Object.keys(payload).length !== 1 || !planetId || planetId.length > 128) {
    return socialResponse({ error: 'INVALID_FRIEND_REQUEST' }, 400)
  }

  const target = await env.DB.prepare(`
    SELECT p.owner_user_id, p.visibility,
           COALESCE((SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = p.owner_user_id), 1) AS allow_friend_requests
    FROM music_planets p WHERE p.id = ?1
  `).bind(planetId).first<{ owner_user_id: string; visibility: string; allow_friend_requests: number }>()
  if (!target || target.visibility !== 'public') return socialResponse({ error: 'PLANET_NOT_FOUND' }, 404)
  if (target.owner_user_id === identity.userId) return socialResponse({ error: 'INVALID_FRIEND_REQUEST' }, 400)
  if (target.allow_friend_requests !== 1) return socialResponse({ error: 'FRIEND_REQUESTS_DISABLED' }, 403)
  if (await pairIsBlocked(env, identity.userId, target.owner_user_id)) return socialResponse({ error: 'USER_BLOCKED' }, 403)
  if (await pairIsFriends(env, identity.userId, target.owner_user_id)) return socialResponse({ error: 'ALREADY_FRIENDS' }, 409)

  const previous = await env.DB.prepare(`
    SELECT status FROM music_friend_requests WHERE requester_user_id = ?1 AND recipient_user_id = ?2
  `).bind(identity.userId, target.owner_user_id).first<{ status: string }>()
  if (previous?.status === 'pending') return socialResponse({ error: 'REQUEST_ALREADY_PENDING' }, 409)
  if (previous?.status === 'rejected') return socialResponse({ error: 'REQUEST_REJECTED' }, 403)

  const now = new Date().toISOString()
  const requestId = crypto.randomUUID()
  const inserted = await env.DB.prepare(`
    INSERT INTO music_friend_requests
      (id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at)
    SELECT ?1, ?2, p.owner_user_id, p.id, 'pending', ?4, ?4
    FROM music_planets p
    WHERE p.id = ?3 AND p.visibility = 'public' AND p.owner_user_id <> ?2
      AND COALESCE((SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = p.owner_user_id), 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id = ?2 AND b.blocked_user_id = p.owner_user_id)
          OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?2)
      )
      AND NOT EXISTS (
        SELECT 1 FROM music_friendships f
        WHERE f.user_a_id = MIN(?2, p.owner_user_id) AND f.user_b_id = MAX(?2, p.owner_user_id)
      )
    ON CONFLICT(requester_user_id, recipient_user_id) DO UPDATE SET
      id = excluded.id, planet_id = excluded.planet_id, status = 'pending',
      created_at = excluded.created_at, updated_at = excluded.updated_at, responded_at = NULL
    WHERE music_friend_requests.status IN ('accepted', 'cancelled')
  `).bind(requestId, identity.userId, planetId, now).run()
  if (!inserted.meta.changes) return socialResponse({ error: 'REQUEST_NOT_AVAILABLE' }, 409)
  return socialResponse({ request: { id: requestId, status: 'pending', planetId } }, 201)
}
