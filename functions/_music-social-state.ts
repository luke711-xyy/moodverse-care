import type { Env } from './_shared'
import type { MusicSocialSnapshot } from '../src/music-api'
import { readPlanetDitherVisuals } from './_music-dither'

type Row = {
  kind: 'incoming' | 'outgoing' | 'friend'
  id: string; user_id: string; planet_id: string | null; display_name: string; tagline: string
  status: 'pending' | 'rejected'; created_at: string; unread_count: number
  visual_json: string | null; last_message_at: string | null
}

/** One SQL snapshot: friendship wins over historical requests, never two conflicting states. */
export async function readMusicSocialState(env: Env, userId: string): Promise<MusicSocialSnapshot> {
  const { results } = await env.DB.prepare(`
    WITH requests AS (
      SELECT r.*, CASE WHEN r.recipient_user_id = ?1 THEN 'incoming' ELSE 'outgoing' END AS kind,
        CASE WHEN r.recipient_user_id = ?1 THEN r.requester_user_id ELSE r.recipient_user_id END AS peer_id
      FROM music_friend_requests r
      WHERE ((r.recipient_user_id = ?1 AND r.status = 'pending')
        OR (r.requester_user_id = ?1 AND r.status IN ('pending', 'rejected')))
        AND NOT EXISTS (SELECT 1 FROM music_friendships f
          WHERE f.user_a_id = MIN(r.requester_user_id, r.recipient_user_id)
            AND f.user_b_id = MAX(r.requester_user_id, r.recipient_user_id))
        AND NOT EXISTS (SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = r.requester_user_id AND b.blocked_user_id = r.recipient_user_id)
            OR (b.blocker_user_id = r.recipient_user_id AND b.blocked_user_id = r.requester_user_id))
    ), request_cards AS (
      SELECT r.kind, r.id, r.peer_id AS user_id, p.id AS planet_id,
        COALESCE(p.display_name, '星球暂不可见') AS display_name, COALESCE(p.tagline, '') AS tagline,
        r.status, r.created_at, 0 AS unread_count, p.visual_json, NULL AS last_message_at
      FROM requests r LEFT JOIN music_planets p ON p.owner_user_id = r.peer_id AND p.visibility = 'public'
    ), incoming AS (
      SELECT * FROM request_cards WHERE kind = 'incoming' ORDER BY created_at DESC, id DESC LIMIT 50
    ), outgoing AS (
      SELECT * FROM request_cards WHERE kind = 'outgoing' ORDER BY created_at DESC, id DESC LIMIT 50
    ), friends AS (
      SELECT 'friend' AS kind, peer.id, peer.id AS user_id, p.id AS planet_id,
        COALESCE(p.display_name, '好友星球') AS display_name, COALESCE(p.tagline, '') AS tagline,
        'accepted' AS status, f.created_at,
        (SELECT count(*) FROM music_direct_messages m WHERE m.sender_user_id = peer.id
          AND m.recipient_user_id = ?1 AND m.read_at IS NULL AND m.hidden_for_recipient = 0) AS unread_count,
        p.visual_json,
        (SELECT MAX(m.created_at) FROM music_direct_messages m
          WHERE (m.sender_user_id=?1 AND m.recipient_user_id=peer.id AND m.hidden_for_sender=0)
             OR (m.sender_user_id=peer.id AND m.recipient_user_id=?1 AND m.hidden_for_recipient=0)) AS last_message_at
      FROM music_friendships f
      JOIN users peer ON peer.id = CASE WHEN f.user_a_id = ?1 THEN f.user_b_id ELSE f.user_a_id END
      LEFT JOIN music_planets p ON p.owner_user_id = peer.id AND p.visibility = 'public'
      WHERE (f.user_a_id = ?1 OR f.user_b_id = ?1)
        AND NOT EXISTS (SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = peer.id)
            OR (b.blocker_user_id = peer.id AND b.blocked_user_id = ?1))
      ORDER BY f.created_at DESC, peer.id ASC LIMIT 50
    )
    SELECT * FROM incoming UNION ALL SELECT * FROM outgoing UNION ALL SELECT * FROM friends
  `).bind(userId).all<Row>()
  const planets = new Map(results.flatMap(row => row.planet_id && row.visual_json
    ? [[row.planet_id, { id: row.planet_id, visual_json: row.visual_json }] as const] : []))
  const visuals = await readPlanetDitherVisuals(env, [...planets.values()])
  const snapshot: MusicSocialSnapshot = { incoming: [], outgoing: [], friends: [] }
  for (const row of results) {
    const visual = row.planet_id ? visuals.get(row.planet_id) : undefined
    const card = { userId: row.user_id, planetId: row.planet_id, displayName: row.display_name, tagline: row.tagline, ...(visual ? { visual } : {}) }
    if (row.kind === 'friend') snapshot.friends.push({ ...card, occurredAt: row.created_at, canVisit: Boolean(row.planet_id), unreadCount: row.unread_count, lastMessageAt: row.last_message_at })
    else snapshot[row.kind].push({ ...card, id: row.id, status: row.status, createdAt: row.created_at })
  }
  return snapshot
}

/** Bounded SSE connections re-authenticate on reconnect and stay under the D1 query budget. */
export function musicSocialStream(request: Request, env: Env, userId: string, initial: MusicSocialSnapshot) {
  const encoder = new TextEncoder()
  let previous = JSON.stringify(initial), stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let wake: (() => void) | undefined
  const started = Date.now()
  let controller: ReadableStreamDefaultController<Uint8Array>
  const cleanup = () => {
    stopped = true; clearTimeout(timer); wake?.()
    request.signal.removeEventListener('abort', abort)
  }
  const abort = () => { if (!stopped) { cleanup(); controller.close() } }
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
      controller.enqueue(encoder.encode(`retry: 1000\nevent: social\ndata: ${previous}\n\n`))
      request.signal.addEventListener('abort', abort, { once: true })
      if (request.signal.aborted) abort()
    },
    async pull() {
      await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, 2000) })
      if (stopped) return
      if (Date.now() - started >= 24000) { abort(); return }
      try {
        const next = JSON.stringify(await readMusicSocialState(env, userId))
        if (stopped) return
        controller.enqueue(encoder.encode(next === previous ? ': keepalive\n\n' : `event: social\ndata: ${next}\n\n`))
        previous = next
      } catch (error) { if (!stopped) { cleanup(); controller.error(error) } }
    },
    cancel() { cleanup() },
  })
  return new Response(stream, { headers: {
    'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'private, no-store, no-transform',
    'x-content-type-options': 'nosniff',
  } })
}
