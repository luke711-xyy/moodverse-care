import { authenticatedMusicUser, type Env } from '../../../../_shared'
import { decodeSocialRouteId, pairIsBlocked, pairIsFriends, socialResponse } from '../../../../_music-social'

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!request.headers.get('cookie') && !request.headers.get('cf-access-jwt-assertion')) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const messageId = decodeSocialRouteId(params?.id)
  if (!messageId) return socialResponse({ error: 'NOT_FOUND' }, 404)
  const row = await env.DB.prepare(`SELECT m.sender_user_id, m.recipient_user_id, a.photo_key, a.content_type
    FROM music_direct_messages m JOIN music_direct_message_attachments a ON a.message_id = m.id
    WHERE m.id = ?1 AND a.kind = 'photo' AND ((m.sender_user_id = ?2 AND m.hidden_for_sender = 0) OR (m.recipient_user_id = ?2 AND m.hidden_for_recipient = 0))`).bind(messageId, identity.userId).first<{ sender_user_id: string; recipient_user_id: string; photo_key: string; content_type: string }>()
  if (!row || await pairIsBlocked(env, row.sender_user_id, row.recipient_user_id) || !await pairIsFriends(env, row.sender_user_id, row.recipient_user_id)) return socialResponse({ error: 'NOT_FOUND' }, 404)
  const object = await env.MUSIC_MEDIA?.get(row.photo_key)
  if (!object) return socialResponse({ error: 'NOT_FOUND' }, 404)
  return new Response(object.body, { headers: { 'content-type': row.content_type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cross-origin-resource-policy': 'same-origin' } })
}
