import { authenticatedMusicUser, type Env } from '../../../_shared'
import { decodeSocialRouteId, socialResponse } from '../../../_music-social'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const userId = decodeSocialRouteId(params?.userId)
  if (!userId || userId === identity.userId) return socialResponse({ error: 'INVALID_BLOCK' }, 400)
  await env.DB.prepare(`
    DELETE FROM music_user_blocks WHERE blocker_user_id = ?1 AND blocked_user_id = ?2
  `).bind(identity.userId, userId).run()
  return socialResponse({ ok: true })
}
