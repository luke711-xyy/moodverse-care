import { authenticatedMusicUser, type Env } from '../../../_shared'
import { decodeSocialRouteId, normalizedPair, socialResponse } from '../../../_music-social'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const peerUserId = decodeSocialRouteId(params?.userId)
  if (!peerUserId || peerUserId === identity.userId) {
    return socialResponse({ error: 'INVALID_FRIEND' }, 400)
  }

  const [userA, userB] = normalizedPair(identity.userId, peerUserId)
  const now = new Date().toISOString()
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE music_friend_requests SET status = 'cancelled', updated_at = ?3
      WHERE ((requester_user_id = ?1 AND recipient_user_id = ?2)
          OR (requester_user_id = ?2 AND recipient_user_id = ?1))
        AND status IN ('accepted', 'pending', 'rejected')
        AND EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = ?1 AND user_b_id = ?2)
    `).bind(userA, userB, now),
    env.DB.prepare(`
      DELETE FROM music_friendships WHERE user_a_id = ?1 AND user_b_id = ?2
    `).bind(userA, userB),
  ])
  return results[1]?.meta.changes
    ? socialResponse({ ok: true })
    : socialResponse({ error: 'NOT_FRIENDS' }, 404)
}
