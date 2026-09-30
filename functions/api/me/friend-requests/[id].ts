import { authenticatedMusicUser, json, type Env } from '../../../_shared'
import { isSocialRecord, normalizedPair, pairIsBlocked, socialResponse } from '../../../_music-social'

type Action = 'accept' | 'reject'

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const requestId = typeof params?.id === 'string' ? params.id.trim() : ''
  const payload = await json<unknown>(request)
  const action = isSocialRecord(payload) && Object.keys(payload).length === 1 ? payload.action : undefined
  if (!requestId || requestId.length > 128 || (action !== 'accept' && action !== 'reject')) {
    return socialResponse({ error: 'INVALID_FRIEND_REQUEST' }, 400)
  }

  const pending = await env.DB.prepare(`
    SELECT requester_user_id FROM music_friend_requests
    WHERE id = ?1 AND recipient_user_id = ?2 AND status = 'pending'
  `).bind(requestId, identity.userId).first<{ requester_user_id: string }>()
  if (!pending) return socialResponse({ error: 'FRIEND_REQUEST_NOT_FOUND' }, 404)
  if (action === 'reject') {
    const now = new Date().toISOString()
    const result = await env.DB.prepare(`
      UPDATE music_friend_requests SET status = 'rejected', updated_at = ?3, responded_at = ?3
      WHERE id = ?1 AND recipient_user_id = ?2 AND status = 'pending'
    `).bind(requestId, identity.userId, now).run()
    return result.meta.changes
      ? socialResponse({ requestId, status: 'rejected' })
      : socialResponse({ error: 'FRIEND_REQUEST_NOT_FOUND' }, 404)
  }

  if (await pairIsBlocked(env, identity.userId, pending.requester_user_id)) {
    return socialResponse({ error: 'USER_BLOCKED' }, 409)
  }
  const [userA, userB] = normalizedPair(identity.userId, pending.requester_user_id)
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO music_friendships (user_a_id, user_b_id, created_at)
      SELECT MIN(requester_user_id, recipient_user_id), MAX(requester_user_id, recipient_user_id), ?3
      FROM music_friend_requests r
      WHERE r.id = ?1 AND r.recipient_user_id = ?2 AND r.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id = r.requester_user_id AND b.blocked_user_id = r.recipient_user_id)
            OR (b.blocker_user_id = r.recipient_user_id AND b.blocked_user_id = r.requester_user_id)
        )
    `).bind(requestId, identity.userId, now),
    env.DB.prepare(`
      UPDATE music_friend_requests SET status = 'accepted', updated_at = ?3, responded_at = ?3
      WHERE id = ?1 AND recipient_user_id = ?2 AND status = 'pending'
        AND EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = ?4 AND user_b_id = ?5)
    `).bind(requestId, identity.userId, now, userA, userB),
    env.DB.prepare(`
      UPDATE music_friend_requests SET status = 'accepted', updated_at = ?3, responded_at = ?3
      WHERE requester_user_id = ?2 AND recipient_user_id = ?1 AND status = 'pending'
        AND EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = ?4 AND user_b_id = ?5)
    `).bind(identity.userId, pending.requester_user_id, now, userA, userB),
  ])
  const friends = await env.DB.prepare(`
    SELECT 1 AS friends FROM music_friendships WHERE user_a_id = ?1 AND user_b_id = ?2
  `).bind(userA, userB).first<{ friends: number }>()
  return friends
    ? socialResponse({ requestId, status: 'accepted' })
    : socialResponse({ error: 'FRIEND_REQUEST_NOT_FOUND' }, 409)
}
