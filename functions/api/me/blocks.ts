import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { isSocialRecord, socialResponse } from '../../_music-social'

type BlockRow = { user_id: string; planet_id: string | null; display_name: string; created_at: string }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const { results } = await env.DB.prepare(`
    SELECT b.blocked_user_id AS user_id, p.id AS planet_id,
           CASE WHEN p.id IS NULL THEN '星球暂不可见' ELSE p.display_name END AS display_name,
           b.created_at
    FROM music_user_blocks b
    LEFT JOIN music_planets p ON p.owner_user_id = b.blocked_user_id AND p.visibility = 'public'
    WHERE b.blocker_user_id = ?1
    ORDER BY b.created_at DESC, b.blocked_user_id ASC
    LIMIT 100
  `).bind(identity.userId).all<BlockRow>()
  return socialResponse({ blocks: results.map((row) => ({
    userId: row.user_id,
    planetId: row.planet_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  })) })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const payload = await json<unknown>(request)
  const planetId = isSocialRecord(payload) && typeof payload.planetId === 'string' ? payload.planetId.trim() : ''
  const userId = isSocialRecord(payload) && typeof payload.userId === 'string' ? payload.userId.trim() : ''
  if (!isSocialRecord(payload) || Object.keys(payload).length !== 1 || (!planetId && !userId)
    || planetId.length > 128 || userId.length > 128 || userId === identity.userId) {
    return socialResponse({ error: 'INVALID_BLOCK' }, 400)
  }
  // Settings can manage a known friend even when their planet is private.
  // Unknown user IDs are not an alternative way to look up private accounts.
  const target = userId ? await env.DB.prepare(`
    SELECT u.id AS owner_user_id FROM users u WHERE u.id = ?2 AND (
      EXISTS (SELECT 1 FROM music_friendships f
        WHERE f.user_a_id = MIN(?1, ?2) AND f.user_b_id = MAX(?1, ?2))
      OR EXISTS (SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = ?2)
           OR (b.blocker_user_id = ?2 AND b.blocked_user_id = ?1))
    )
  `).bind(identity.userId, userId).first<{ owner_user_id: string }>() : await env.DB.prepare(`
    SELECT owner_user_id FROM music_planets WHERE id = ?1 AND visibility = 'public'
  `).bind(planetId).first<{ owner_user_id: string }>()
  if (!target) return socialResponse({ error: userId ? 'FRIEND_NOT_FOUND' : 'PLANET_NOT_FOUND' }, 404)
  if (target.owner_user_id === identity.userId) return socialResponse({ error: 'INVALID_BLOCK' }, 400)

  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at)
      VALUES (?1, ?2, ?3)
    `).bind(identity.userId, target.owner_user_id, now),
    env.DB.prepare(`
      DELETE FROM music_friendships
      WHERE user_a_id = MIN(?1, ?2) AND user_b_id = MAX(?1, ?2)
    `).bind(identity.userId, target.owner_user_id),
    env.DB.prepare(`
      DELETE FROM music_friend_requests
      WHERE (requester_user_id = ?1 AND recipient_user_id = ?2)
         OR (requester_user_id = ?2 AND recipient_user_id = ?1)
    `).bind(identity.userId, target.owner_user_id),
  ])
  return socialResponse({ ok: true })
}
