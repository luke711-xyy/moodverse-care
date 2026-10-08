import { authenticatedMusicUser, type Env } from '../../_shared'
import { discoverPublicPlanets } from '../music/discovery'
import { readPlanetDitherVisuals } from '../../_music-dither'

type PlanetCardRow = {
  planet_id: string
  display_name: string
  tagline: string
  occurred_at: string
  is_incognito?: number
  user_id?: string
  can_visit?: number
  position?: number
  reason_code?: 'similar_genre' | 'similar_mood' | 'similar_moment' | 'semantic_profile' | 'random'
  match_score?: number
  unread_count?: number
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
})

async function ensureDailyRoam(env: Env, userId: string, date: string) {
  const existing = await env.DB.prepare(`
    SELECT count(*) AS count FROM music_daily_roam
    WHERE user_id = ?1 AND recommendation_date = ?2
  `).bind(userId, date).first<{ count: number }>()
  if ((existing?.count ?? 0) > 0) return

  const discovery = await discoverPublicPlanets(env, userId, true)
  const createdAt = new Date().toISOString()
  const writes = discovery.recommendations.slice(0, 6).map((item, position) => env.DB.prepare(`
    INSERT OR IGNORE INTO music_daily_roam
      (user_id, recommendation_date, planet_id, position, reason_code, match_score, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `).bind(userId, date, item.planetId, position, item.reasonCode, item.matchScore, createdAt))
  if (writes.length) await env.DB.batch(writes)
}

async function readOrbitGroups(env: Env, userId: string, date: string) {
  const [encounters, friendships, visitsByMe, visitorsToMe, dailyRoam] = await Promise.all([
    env.DB.prepare(`
      SELECT p.id AS planet_id, p.display_name, p.tagline,
             MAX(e.last_encountered_at) AS occurred_at
      FROM music_song_encounters e
      JOIN music_planets p ON p.id = e.planet_id AND p.visibility = 'public'
      WHERE e.visitor_user_id = ?1
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
             OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
        )
      GROUP BY p.id, p.display_name, p.tagline
      ORDER BY occurred_at DESC, p.id ASC
      LIMIT 50
    `).bind(userId).all<PlanetCardRow>(),
    env.DB.prepare(`
      SELECT peer.id AS user_id,
             CASE WHEN p.visibility = 'public' THEN p.id ELSE NULL END AS planet_id,
             CASE WHEN p.visibility = 'public' THEN p.display_name ELSE '好友星球' END AS display_name,
             CASE WHEN p.visibility = 'public' THEN p.tagline ELSE '' END AS tagline,
             f.created_at AS occurred_at,
             CASE WHEN p.visibility = 'public' THEN 1 ELSE 0 END AS can_visit,
             (SELECT count(*) FROM music_direct_messages m
              WHERE m.sender_user_id = peer.id AND m.recipient_user_id = ?1
                AND m.read_at IS NULL AND m.hidden_for_recipient = 0) AS unread_count
      FROM music_friendships f
      JOIN users peer ON peer.id = CASE WHEN f.user_a_id = ?1 THEN f.user_b_id ELSE f.user_a_id END
      LEFT JOIN music_planets p ON p.owner_user_id = peer.id
      WHERE (f.user_a_id = ?1 OR f.user_b_id = ?1)
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = peer.id)
             OR (b.blocker_user_id = peer.id AND b.blocked_user_id = ?1)
        )
      ORDER BY f.created_at DESC, peer.id ASC
      LIMIT 50
    `).bind(userId).all<PlanetCardRow>(),
    env.DB.prepare(`
      SELECT p.id AS planet_id, p.display_name, p.tagline,
             v.last_visited_at AS occurred_at, v.is_incognito
      FROM music_planet_visits v
      JOIN music_planets p ON p.id = v.planet_id AND p.visibility = 'public'
      WHERE v.visitor_user_id = ?1 AND p.owner_user_id <> ?1
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
             OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
        )
      ORDER BY v.last_visited_at DESC, p.id ASC
      LIMIT 50
    `).bind(userId).all<PlanetCardRow>(),
    env.DB.prepare(`
      SELECT visitor.id AS user_id, visitor_planet.id AS planet_id,
             visitor_planet.display_name, visitor_planet.tagline,
             v.last_visited_at AS occurred_at
      FROM music_planet_visits v
      JOIN music_planets owned_planet ON owned_planet.id = v.planet_id
      JOIN music_planets visitor_planet
        ON visitor_planet.owner_user_id = v.visitor_user_id AND visitor_planet.visibility = 'public'
      JOIN users visitor ON visitor.id = v.visitor_user_id
      WHERE owned_planet.owner_user_id = ?1 AND v.is_incognito = 0 AND v.visitor_user_id <> ?1
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = v.visitor_user_id)
             OR (b.blocker_user_id = v.visitor_user_id AND b.blocked_user_id = ?1)
        )
      ORDER BY v.last_visited_at DESC, visitor_planet.id ASC
      LIMIT 50
    `).bind(userId).all<PlanetCardRow>(),
    env.DB.prepare(`
      SELECT p.id AS planet_id, p.display_name, p.tagline, r.created_at AS occurred_at,
             r.position, r.reason_code, r.match_score
      FROM music_daily_roam r
      JOIN music_planets p ON p.id = r.planet_id AND p.visibility = 'public'
      WHERE r.user_id = ?1 AND r.recommendation_date = ?2
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
             OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
        )
      ORDER BY r.position ASC, p.id ASC
      LIMIT 6
    `).bind(userId, date).all<PlanetCardRow>(),
  ])

  const card = (row: PlanetCardRow) => ({
    planetId: row.planet_id,
    displayName: row.display_name,
    tagline: row.tagline,
    occurredAt: row.occurred_at,
  })

  return {
    songEncounters: encounters.results.map(card),
    friends: friendships.results.map((row) => ({
      userId: row.user_id!,
      planetId: row.planet_id || null,
      displayName: row.display_name,
      tagline: row.tagline,
      occurredAt: row.occurred_at,
      canVisit: row.can_visit === 1,
      unreadCount: row.unread_count ?? 0,
    })),
    visitedByMe: visitsByMe.results.map((row) => ({ ...card(row), isIncognito: row.is_incognito === 1 })),
    visitorsToMe: visitorsToMe.results.map((row) => ({ ...card(row), userId: row.user_id! })),
    dailyRoam: dailyRoam.results.map((row) => ({
      ...card(row),
      reasonCode: row.reason_code!,
      matchScore: row.match_score!,
    })),
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const date = new Date().toISOString().slice(0, 10)
  await ensureDailyRoam(env, identity.userId, date)
  const groups = await readOrbitGroups(env, identity.userId, date)
  const ids = [...new Set(Object.values(groups).flatMap((group) => group.map((card) => card.planetId)).filter((id): id is string => Boolean(id)))]
  const rows: Array<{ id: string; visual_json: string }> = []
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const result = await env.DB.prepare(`SELECT id,visual_json FROM music_planets WHERE visibility='public' AND id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ id: string; visual_json: string }>()
    rows.push(...result.results)
  }
  const visuals = await readPlanetDitherVisuals(env, rows)
  for (const group of Object.values(groups)) for (const card of group) {
    if (card.planetId && visuals.has(card.planetId)) Object.assign(card, { visual: visuals.get(card.planetId) })
  }
  return respond({ date, groups })
}
