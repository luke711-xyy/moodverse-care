import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { isSocialRecord, pairIsBlocked, pairIsFriends, socialResponse } from '../../_music-social'
import { musicSocialStream, readMusicSocialState } from '../../_music-social-state'
import { autoAcceptDemoRequest } from '../../_music-demo-social'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return socialResponse({ error: 'FORBIDDEN' }, 403)
  }
  const snapshot = await readMusicSocialState(env, identity.userId)
  if (url.searchParams.get('stream') === '1') return musicSocialStream(request, env, identity.userId, snapshot)
  if (url.searchParams.get('live') === '1') return socialResponse(snapshot)
  return socialResponse({ incoming: snapshot.incoming, outgoing: snapshot.outgoing })
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
  const accepted = await autoAcceptDemoRequest(env, requestId, now)
  return socialResponse({ request: { id: requestId, status: accepted ? 'accepted' : 'pending', planetId } }, 201)
}
