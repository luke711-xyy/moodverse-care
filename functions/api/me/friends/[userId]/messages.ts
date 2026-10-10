import { authenticatedMusicUser, json, type Env } from '../../../../_shared'
import { decodeSocialRouteId, isSocialRecord, pairIsBlocked, pairIsFriends, socialResponse } from '../../../../_music-social'
import { catalogTrack, CATALOG_VISUAL_COLUMNS, type CatalogTrackRow } from '../../../../_music-dither'
import { readDirectPhoto, DirectPhotoError } from '../../../../_music-direct-photo'

const MAX_MESSAGE_CHARACTERS = 2_000
const MAX_MESSAGES_PER_MINUTE = 30

type MessageRow = {
  id: string
  sender_user_id: string
  recipient_user_id: string
  content_text: string
  created_at: string
  read_at: string | null
  kind: 'song' | 'photo' | null
  track_id: string | null
}

async function requireConversation(request: Request, env: Env, rawPeerId: unknown) {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return { response: socialResponse({ error: 'UNAUTHENTICATED' }, 401) }
  const peerId = decodeSocialRouteId(rawPeerId)
  if (!peerId || peerId === identity.userId) {
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
  const cursor = new URL(request.url).searchParams.get('before')
  const parts = cursor?.split('|')
  if (cursor && (!parts || parts.length !== 2 || !/^\d{4}-\d{2}-\d{2}T/.test(parts[0]) || !parts[1] || parts[1].length > 128)) return socialResponse({ error: 'INVALID_CURSOR' }, 400)
  const { results } = await env.DB.prepare(`
      SELECT m.id, sender_user_id, recipient_user_id, content_text, created_at, read_at, a.kind, a.track_id
      FROM music_direct_messages m LEFT JOIN music_direct_message_attachments a ON a.message_id = m.id
      WHERE ((sender_user_id = ?1 AND recipient_user_id = ?2 AND hidden_for_sender = 0)
          OR (sender_user_id = ?2 AND recipient_user_id = ?1 AND hidden_for_recipient = 0))
        AND (?3 = '' OR created_at < ?3 OR (created_at = ?3 AND m.id < ?4))
      ORDER BY created_at DESC, m.id DESC LIMIT 51
  `).bind(identity.userId, peerId, parts?.[0] ?? '', parts?.[1] ?? '').all<MessageRow>()
  const rows = results.slice(0, 50).reverse()
  const incoming = rows.filter(row => row.recipient_user_id === identity.userId && !row.read_at)
  if (incoming.length) await env.DB.prepare(`UPDATE music_direct_messages SET read_at = ? WHERE id IN (${incoming.map(() => '?').join(',')})`).bind(readAt, ...incoming.map(row => row.id)).run()
  const trackIds = [...new Set(rows.flatMap(row => row.track_id ? [row.track_id] : []))]
  const tracks = trackIds.length ? (await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.is_active = 1 AND c.id IN (${trackIds.map(() => '?').join(',')})`).bind(...trackIds).all<CatalogTrackRow>()).results : []
  const trackMap = new Map(tracks.map(row => [row.id, catalogTrack(row)]))
  return socialResponse({
    peerUserId: peerId,
    hasMore: results.length > 50,
    nextCursor: results.length > 50 ? `${rows[0].created_at}|${rows[0].id}` : null,
    messages: rows.map((row) => ({
      id: row.id,
      contentText: row.content_text,
      createdAt: row.created_at,
      readAt: row.read_at ?? (row.recipient_user_id === identity.userId ? readAt : null),
      isOwn: row.sender_user_id === identity.userId,
      kind: row.kind ?? 'text',
      ...(row.kind === 'song' ? { track: trackMap.get(row.track_id ?? '') ?? null } : {}),
      ...(row.kind === 'photo' ? { photoUrl: `/api/me/messages/${encodeURIComponent(row.id)}/photo` } : {}),
    })),
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const access = await requireConversation(request, env, params?.userId)
  if ('response' in access) return access.response
  const { identity, peerId } = access
  let photo: { bytes: Uint8Array; type: string } | undefined
  let payload: unknown
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    try { const parsed = await readDirectPhoto(request); photo = parsed.photo; payload = { contentText: parsed.contentText } }
    catch (error) { if (error instanceof DirectPhotoError) return socialResponse({ error: error.message }, error.status); throw error }
    if (!env.MUSIC_MEDIA) return socialResponse({ error: 'MEDIA_UNAVAILABLE' }, 503)
  } else payload = await json<unknown>(request)
  if (!isSocialRecord(payload) || Object.keys(payload).some(key => !['contentText', 'trackId'].includes(key))
    || (payload.contentText !== undefined && typeof payload.contentText !== 'string')
    || (payload.trackId !== undefined && (typeof payload.trackId !== 'string' || !payload.trackId || payload.trackId.length > 128))) return socialResponse({ error: 'INVALID_MESSAGE' }, 400)
  const trackRow = typeof payload.trackId === 'string' ? await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.id = ? AND c.is_active = 1`).bind(payload.trackId).first<CatalogTrackRow>() : null
  if (payload.trackId && !trackRow) return socialResponse({ error: 'INVALID_TRACK' }, 400)
  const track = trackRow ? catalogTrack(trackRow) : null
  const contentText = (typeof payload.contentText === 'string' ? payload.contentText.trim() : '') || (photo ? '[图片]' : track ? `[歌曲] ${track.title}` : '')
  const characterCount = Array.from(contentText).length
  if (!contentText || characterCount > MAX_MESSAGE_CHARACTERS) {
    return socialResponse({ error: 'INVALID_MESSAGE' }, 400)
  }

  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const photoKey = photo ? `direct-message-photos/${id}` : null
  if (photo && photoKey) await env.MUSIC_MEDIA!.put(photoKey, photo.bytes, { httpMetadata: { contentType: photo.type } })
  const insert = env.DB.prepare(`
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
      AND (
        SELECT count(*) FROM music_direct_messages recent
        WHERE recent.sender_user_id = ?2 AND recent.created_at >= ?6
      ) < ?7
  `).bind(id, identity.userId, peerId, contentText, createdAt, windowStart, MAX_MESSAGES_PER_MINUTE)
  let inserted: D1Result
  try {
    const statements = [insert]
    if (photo || track) statements.push(env.DB.prepare(`INSERT INTO music_direct_message_attachments(message_id,kind,track_id,photo_key,content_type,byte_size) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM music_direct_messages WHERE id = ?)`).bind(id, photo ? 'photo' : 'song', track?.id ?? null, photoKey, photo?.type ?? null, photo?.bytes.length ?? null, id))
    ;[inserted] = await env.DB.batch(statements)
  } catch (error) { if (photoKey) await env.MUSIC_MEDIA!.delete(photoKey); throw error }
  if (!inserted.meta.changes) {
    if (photoKey) await env.MUSIC_MEDIA!.delete(photoKey)
    const blocked = await pairIsBlocked(env, identity.userId, peerId)
    if (blocked) return socialResponse({ error: 'USER_BLOCKED' }, 403)
    if (!await pairIsFriends(env, identity.userId, peerId)) {
      return socialResponse({ error: 'FRIENDSHIP_REQUIRED' }, 403)
    }
    const recent = await env.DB.prepare(`
      SELECT count(*) AS count FROM music_direct_messages
      WHERE sender_user_id = ?1 AND created_at >= ?2
    `).bind(identity.userId, windowStart).first<{ count: number }>()
    if ((recent?.count ?? 0) >= MAX_MESSAGES_PER_MINUTE) {
      return socialResponse({ error: 'MESSAGE_RATE_LIMITED' }, 429)
    }
    return socialResponse({ error: 'MESSAGE_WRITE_CONFLICT' }, 409)
  }
  return socialResponse({ message: {
    id,
    contentText,
    createdAt,
    readAt: null,
    isOwn: true,
    kind: photo ? 'photo' : track ? 'song' : 'text',
    ...(track ? { track } : {}),
    ...(photo ? { photoUrl: `/api/me/messages/${id}/photo` } : {}),
  } }, 201)
}
