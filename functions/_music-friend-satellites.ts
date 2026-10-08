type FriendSatelliteDatabase = { DB: D1Database }

export type MusicFriendSatellite = {
  id: string
  displayName: string
  tagline: string
  color: string
  visualSeed: string
  orbitRadius: number
  orbitPhase: number
  isVirtual: boolean
  canRemove: boolean
}

const DEFAULT_FRIEND_SATELLITES = [
  { slot: 0, displayName: '小满', tagline: '喜欢沿着熟悉的旋律散步。', color: '#77dec8', visualSeed: 'moodverse-friend-mint', orbitRadius: 0.235, orbitPhase: 0.35 },
  { slot: 1, displayName: '星野', tagline: '把晚风收藏进歌里。', color: '#b39aff', visualSeed: 'moodverse-friend-lilac', orbitRadius: 0.265, orbitPhase: 2.42 },
  { slot: 2, displayName: '阿澄', tagline: '每一条河都有自己的节奏。', color: '#ffc47d', visualSeed: 'moodverse-friend-amber', orbitRadius: 0.295, orbitPhase: 4.53 },
] as const

export function defaultFriendSatelliteStatements(env: FriendSatelliteDatabase, ownerUserId: string, createdAt: string) {
  return DEFAULT_FRIEND_SATELLITES.map((friend) => env.DB.prepare(`
    INSERT OR IGNORE INTO music_friend_satellites
      (id, owner_user_id, friend_slot, display_name, tagline, color, visual_seed, orbit_radius, orbit_phase, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    `virtual-friend-${friend.slot}-${ownerUserId}`,
    ownerUserId,
    friend.slot,
    friend.displayName,
    friend.tagline,
    friend.color,
    friend.visualSeed,
    friend.orbitRadius,
    friend.orbitPhase,
    createdAt,
  ))
}

/** Seed a legacy account once; soft-deleted rows keep their slot so refresh never restores them. */
export async function ensureDefaultFriendSatellites(env: FriendSatelliteDatabase, ownerUserId: string, createdAt = new Date().toISOString()) {
  const existing = await env.DB.prepare(`
    SELECT friend_slot FROM music_friend_satellites WHERE owner_user_id = ?1
  `).bind(ownerUserId).all<{ friend_slot: number }>()
  const existingSlots = new Set(existing.results.map((row) => row.friend_slot))
  const statements = defaultFriendSatelliteStatements(env, ownerUserId, createdAt)
    .filter((_, slot) => !existingSlots.has(slot))
  if (statements.length) await env.DB.batch(statements)
}

export async function readFriendSatellites(env: FriendSatelliteDatabase, ownerUserId: string): Promise<MusicFriendSatellite[]> {
  const [virtualFriends, realFriends] = await Promise.all([
    env.DB.prepare(`
    SELECT id, display_name, tagline, color, visual_seed, orbit_radius, orbit_phase
    FROM music_friend_satellites
    WHERE owner_user_id = ?1 AND deleted_at IS NULL
    ORDER BY friend_slot ASC
    `).bind(ownerUserId).all<{
    id: string
    display_name: string
    tagline: string
    color: string
    visual_seed: string
    orbit_radius: number
    orbit_phase: number
    }>(),
    env.DB.prepare(`
      SELECT peer.id AS user_id,
             CASE WHEN p.visibility = 'public' THEN p.display_name ELSE '好友星球' END AS display_name,
             CASE WHEN p.visibility = 'public' THEN p.tagline ELSE '' END AS tagline,
             CASE WHEN p.visibility = 'public' THEN p.visual_json ELSE NULL END AS visual_json
      FROM music_friendships f
      JOIN users peer ON peer.id = CASE WHEN f.user_a_id = ?1 THEN f.user_b_id ELSE f.user_a_id END
      LEFT JOIN music_planets p ON p.owner_user_id = peer.id
      WHERE (f.user_a_id = ?1 OR f.user_b_id = ?1)
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = peer.id)
             OR (b.blocker_user_id = peer.id AND b.blocked_user_id = ?1)
        )
      ORDER BY f.created_at ASC, peer.id ASC
    `).bind(ownerUserId).all<{
      user_id: string
      display_name: string
      tagline: string
      visual_json: string | null
    }>(),
  ])
  const virtual = virtualFriends.results.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    tagline: row.tagline,
    color: row.color,
    visualSeed: row.visual_seed,
    orbitRadius: row.orbit_radius,
    orbitPhase: row.orbit_phase,
    isVirtual: true,
    canRemove: true,
  }))
  const palette = ['#8dcfff', '#e59bff', '#82e2c5', '#ffcf86', '#9eaaff', '#ff9eba']
  const real = realFriends.results.map((row) => {
    const hash = stableHash(row.user_id)
    let color = palette[hash % palette.length]
    try {
      const visual = row.visual_json ? JSON.parse(row.visual_json) as { palette?: { accent?: unknown } } : null
      if (typeof visual?.palette?.accent === 'string' && /^#[\da-f]{6}$/i.test(visual.palette.accent)) color = visual.palette.accent
    } catch { /* Keep a stable fallback tint for legacy or malformed visual JSON. */ }
    return {
      id: `friend-${row.user_id}`,
      displayName: row.display_name,
      tagline: row.tagline,
      color,
      visualSeed: `moodverse-real-friend-${row.user_id}`,
      orbitRadius: 0.33 + ((hash >>> 8) % 11) * 0.008,
      orbitPhase: ((hash >>> 16) / 0xffff) * Math.PI * 2,
      isVirtual: false,
      canRemove: false,
    }
  })
  return [...real, ...virtual]
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
