import { authenticatedMusicUser, type Env } from '../../../_shared'
import { socialResponse } from '../../../_music-social'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const id = typeof params?.id === 'string' ? params.id.trim() : ''
  if (!id || id.length > 160) return socialResponse({ error: 'INVALID_FRIEND_SATELLITE' }, 400)

  const result = await env.DB.prepare(`
    UPDATE music_friend_satellites SET deleted_at = ?1
    WHERE id = ?2 AND owner_user_id = ?3 AND deleted_at IS NULL
  `).bind(new Date().toISOString(), id, identity.userId).run()
  return result.meta.changes
    ? socialResponse({ deleted: true })
    : socialResponse({ error: 'FRIEND_SATELLITE_NOT_FOUND' }, 404)
}
