import { readPlanetDitherVisuals } from './_music-dither'
import { stableHash, type DitherPlanetSpec } from '../src/music/dither/appearance'
import { dailyRandom, musicDayKey } from '../src/music/daily-selection'
type FriendSatelliteDatabase = { DB: D1Database }

export type MusicFriendSatellite = {
  id: string
  planetId?: string
  displayName: string
  tagline: string
  color: string
  visualSeed: string
  orbitRadius: number
  orbitPhase: number
  isVirtual: boolean
  canRemove: boolean
  visual?: DitherPlanetSpec
}

export async function readFriendSatellites(env: FriendSatelliteDatabase, ownerUserId: string,
  audience?: { publicOnly: true; viewerUserId?: string | null }): Promise<MusicFriendSatellite[]> {
  // Legacy demo rows deliberately remain stored, but never represent a friend.
  const realFriends = await env.DB.prepare(`
      SELECT peer.id AS user_id,
             CASE WHEN p.visibility = 'public' THEN p.id ELSE NULL END AS planet_id,
             CASE WHEN p.visibility = 'public' THEN p.display_name ELSE '好友星球' END AS display_name,
             CASE WHEN p.visibility = 'public' THEN p.tagline ELSE '' END AS tagline,
             CASE WHEN p.visibility = 'public' THEN p.visual_json ELSE NULL END AS visual_json,
             (SELECT MAX(m.created_at) FROM music_direct_messages m
               WHERE (m.sender_user_id=?1 AND m.recipient_user_id=peer.id AND m.hidden_for_sender=0)
                  OR (m.sender_user_id=peer.id AND m.recipient_user_id=?1 AND m.hidden_for_recipient=0)) AS last_message_at
      FROM music_friendships f
      JOIN users peer ON peer.id = CASE WHEN f.user_a_id = ?1 THEN f.user_b_id ELSE f.user_a_id END
      JOIN music_planets p ON p.owner_user_id = peer.id
      WHERE (f.user_a_id = ?1 OR f.user_b_id = ?1)
        AND (?2 = 0 OR p.visibility = 'public')
        AND (?3 IS NULL OR NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?3 AND b.blocked_user_id = peer.id)
             OR (b.blocker_user_id = peer.id AND b.blocked_user_id = ?3)
        ))
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = peer.id)
             OR (b.blocker_user_id = peer.id AND b.blocked_user_id = ?1)
        )
      ORDER BY f.created_at ASC, peer.id ASC
    `).bind(ownerUserId, audience?.publicOnly ? 1 : 0, audience?.viewerUserId ?? null).all<{
      user_id: string
      planet_id: string | null
      display_name: string
      tagline: string
      visual_json: string | null
      last_message_at: string | null
    }>()
  const day = musicDayKey()
  const randomRanks = new Map(realFriends.results.map(row => [row.user_id, dailyRandom(`${day}:friend-satellites:${ownerUserId}:${row.user_id}`)()]))
  // Return the complete list for management; the scene renders only the first five.
  // Chat timestamps are used here but are never disclosed through public planet responses.
  realFriends.results.sort((a,b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
    || randomRanks.get(a.user_id)! - randomRanks.get(b.user_id)! || a.user_id.localeCompare(b.user_id))
  const visuals = await readPlanetDitherVisuals(env, realFriends.results.flatMap(row => row.planet_id && row.visual_json ? [{id:row.planet_id,visual_json:row.visual_json}] : []))
  const palette = ['#8dcfff', '#e59bff', '#82e2c5', '#ffcf86', '#9eaaff', '#ff9eba']
  const real = realFriends.results.map((row) => {
    // Public responses use planet identifiers, never account identifiers.
    const identity = audience?.publicOnly ? row.planet_id! : row.user_id
    const hash = stableHash(identity)
    let color = palette[hash % palette.length]
    try {
      const visual = row.visual_json ? JSON.parse(row.visual_json) as { palette?: { accent?: unknown } } : null
      if (typeof visual?.palette?.accent === 'string' && /^#[\da-f]{6}$/i.test(visual.palette.accent)) color = visual.palette.accent
    } catch { /* Keep a stable fallback tint for legacy or malformed visual JSON. */ }
    return {
      id: `friend-${identity}`,
      ...(row.planet_id ? { planetId: row.planet_id } : {}),
      displayName: row.display_name,
      tagline: row.tagline,
      color,
      visualSeed: `moodverse-real-friend-${identity}`,
      orbitRadius: 0.33 + ((hash >>> 8) % 11) * 0.008,
      orbitPhase: ((hash >>> 16) / 0xffff) * Math.PI * 2,
      isVirtual: false,
      canRemove: false,
      ...(row.planet_id && visuals.has(row.planet_id) ? {visual:visuals.get(row.planet_id)!} : {}),
    }
  })
  return real
}
