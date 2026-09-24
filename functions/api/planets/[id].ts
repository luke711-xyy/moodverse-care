import { session, withCookie, type Env } from '../../_shared'
import { parseDoodle, publicPlanet, type PlanetRow } from '../../_planet'

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const id = String(params.id ?? '')
  const planet = await env.DB.prepare(`SELECT * FROM user_planets
    WHERE id = ?1 AND archived_at IS NULL AND visibility != 'private'`)
    .bind(id).first<PlanetRow>()
  if (!planet) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const [replies, userBoards, careBoards, weatherHistory] = await Promise.all([
    env.DB.prepare(`SELECT id, text, doodle_json AS doodle, created_at AS createdAt
      FROM replies WHERE planet_id = ?1 AND status = 'visible' ORDER BY created_at DESC LIMIT 20`)
      .bind(id).all<{ id: string; text: string; doodle: string; createdAt: string }>(),
    planet.visibility === 'billboard_public'
      ? env.DB.prepare(`SELECT id, title, text, doodle_json AS doodle, created_at AS createdAt,
          expires_at AS expiresAt FROM planet_billboards WHERE planet_id = ?1 AND trim(text) != ''
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
          ORDER BY created_at DESC LIMIT 30`).bind(id)
        .all<{ id: string; title: string; text: string; doodle: string; createdAt: string; expiresAt: string | null }>()
      : Promise.resolve({ results: [] as Array<{ id: string; title: string; text: string; doodle: string; createdAt: string; expiresAt: string | null }> }),
    env.DB.prepare(`SELECT id, title, message, action, created_at AS createdAt, expires_at AS expiresAt
      FROM care_cards WHERE planet_id = ?1 AND published = 1 AND datetime(expires_at) > datetime('now')
      ORDER BY created_at DESC LIMIT 7`).bind(id)
      .all<{ id: string; title: string; message: string; action: string; createdAt: string; expiresAt: string }>(),
    env.DB.prepare(`SELECT date, mood, intensity FROM (
      SELECT date, mood, intensity,
        row_number() OVER (PARTITION BY date ORDER BY created_at DESC, id DESC) AS day_rank
      FROM mood_entries
      WHERE planet_id = ?1 AND privacy IN ('mood_theme_public', 'billboard_public')
    ) WHERE day_rank = 1 ORDER BY date DESC LIMIT 7`)
      .bind(id).all<{ date: string; mood: string; intensity: number }>(),
  ])
  const billboards = [
    ...userBoards.results.map((board) => ({ ...board, doodle: parseDoodle(board.doodle), kind: 'user' })),
    ...careBoards.results.map((card) => ({
      id: card.id, kind: 'ai', title: card.title, text: `${card.message} ${card.action}`.trim(),
      doodle: [], createdAt: card.createdAt, expiresAt: card.expiresAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return withCookie({ planet: publicPlanet(planet, weatherHistory.results.reverse()), billboards,
    replies: replies.results.map((reply) => ({ ...reply, doodle: parseDoodle(reply.doodle) })) }, active)
}
