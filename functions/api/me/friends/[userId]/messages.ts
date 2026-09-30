import { authenticatedMusicUser, json, type Env } from '../../../../_shared'
import { isSocialRecord, pairIsBlocked, pairIsFriends, socialResponse } from '../../../../_music-social'

const MAX_MESSAGE_CHARACTERS = 2_000
const MAX_MESSAGES_PER_MINUTE = 30

type MessageRow = {
  id: string
  sender_user_id: string
  recipient_user_id: string
  content_text: string
  created_at: string
  read_at: string | null
}

async function requireConversation(request: Request, env: Env, rawPeerId: unknown) {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return { response: socialResponse({ error: 'UNAUTHENTICATED' }, 401) }
  const peerId = typeof rawPeerId === 'string' ? rawPeerId.trim() : ''
  if (!peerId || peerId.length > 128 || peerId === identity.userId) {
    return { response: socialResponse({ error: 'INVALID_CONVERSATION' }, 400) }
  }
  if (await pairIsBlocked(env, identity.userId, peerId)) {
    return { response: socialResponse({ error: 'USER_BLOCKED' }, 403) }
  }
  if (!await pairIsFriends(env, identity.userId, peerId)) {
    return { response: socialResponse({ error: 'FRIENDSHIP_REQUIRED' }, 403) }
  }
  return { identity, peerId }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const access = await requireConversation(request, env, params?.userId)
  if ('response' in access) return access.response
  const { identity, peerId } = access
  const readAt = new Date().toISOString()
  await env.DB.prepare(`
    UPDATE music_direct_messages SET read_at = COALESCE(read_at, ?3)
    WHERE sender_user_id = ?2 AND recipient_user_id = ?1 AND hidden_for_recipient = 0
  `).bind(identity.userId, peerId, readAt).run()
  const { results } = await env.DB.prepare(`
    SELECT id, sender_user_id, recipient_user_id, content_text, created_at, read_at
    FROM (
      SELECT id, sender_user_id, recipient_user_id, content_text, created_at, read_at
      FROM music_direct_messages
      WHERE ((sender_user_id = ?1 AND recipient_user_id = ?2 AND hidden_for_sender = 0)
          OR (sender_user_id = ?2 AND recipient_user_id = ?1 AND hidden_for_recipient = 0))
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    )
    ORDER BY created_at ASC, id ASC
  `).bind(identity.userId, peerId).all<MessageRow>()
  return socialResponse({
    peerUserId: peerId,
    messages: results.map((row) => ({
      id: row.id,
      contentText: row.content_text,
      createdAt: row.created_at,
      readAt: row.read_at,
      isOwn: row.sender_user_id === identity.userId,
    })),
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const access = await requireConversation(request, env, params?.userId)
  if ('response' in access) return access.response
  const { identity, peerId } = access
  const payload = await json<unknown>(request)
  const contentText = isSocialRecord(payload) && Object.keys(payload).length === 1
    && typeof payload.contentText === 'string' ? payload.contentText.trim() : ''
  const characterCount = Array.from(contentText).length
  if (!contentText || characterCount > MAX_MESSAGE_CHARACTERS) {
    return socialResponse({ error: 'INVALID_MESSAGE' }, 400)
  }

  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const recent = await env.DB.prepare(`
    SELECT count(*) AS count FROM music_direct_messages
    WHERE sender_user_id = ?1 AND recipient_user_id = ?2 AND created_at >= ?3
  `).bind(identity.userId, peerId, windowStart).first<{ count: number }>()
  if ((recent?.count ?? 0) >= MAX_MESSAGES_PER_MINUTE) return socialResponse({ error: 'MESSAGE_RATE_LIMITED' }, 429)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const inserted = await env.DB.prepare(`
    INSERT INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE EXISTS (
      SELECT 1 FROM music_friendships f
      WHERE f.user_a_id = MIN(?2, ?3) AND f.user_b_id = MAX(?2, ?3)
    )
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id = ?2 AND b.blocked_user_id = ?3)
          OR (b.blocker_user_id = ?3 AND b.blocked_user_id = ?2)
      )
  `).bind(id, identity.userId, peerId, contentText, createdAt).run()
  if (!inserted.meta.changes) {
    const blocked = await pairIsBlocked(env, identity.userId, peerId)
    return blocked
      ? socialResponse({ error: 'USER_BLOCKED' }, 403)
      : socialResponse({ error: 'FRIENDSHIP_REQUIRED' }, 403)
  }
  return socialResponse({ message: {
    id,
    contentText,
    createdAt,
    readAt: null,
    isOwn: true,
  } }, 201)
}
