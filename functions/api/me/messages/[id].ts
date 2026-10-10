import { authenticatedMusicUser, type Env } from '../../../_shared'
import { decodeSocialRouteId, socialResponse } from '../../../_music-social'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const messageId = decodeSocialRouteId(params?.id)
  if (!messageId) return socialResponse({ error: 'MESSAGE_NOT_FOUND' }, 404)

  const message = await env.DB.prepare(`
    SELECT sender_user_id, recipient_user_id FROM music_direct_messages
    WHERE id = ?1 AND (sender_user_id = ?2 OR recipient_user_id = ?2)
  `).bind(messageId, identity.userId).first<{ sender_user_id: string; recipient_user_id: string }>()
  if (!message) return socialResponse({ error: 'MESSAGE_NOT_FOUND' }, 404)
  await env.DB.prepare(`
    UPDATE music_direct_messages
    SET hidden_for_sender = CASE WHEN sender_user_id = ?2 THEN 1 ELSE hidden_for_sender END,
        hidden_for_recipient = CASE WHEN recipient_user_id = ?2 THEN 1 ELSE hidden_for_recipient END
    WHERE id = ?1 AND (sender_user_id = ?2 OR recipient_user_id = ?2)
  `).bind(messageId, identity.userId).run()
  return socialResponse({ ok: true })
}
