import { session, withCookie, type Env } from '../_shared'
import { parseDoodle, publicPlanet, type PlanetRow } from '../_planet'
import { focusedThemesForUser } from '../_preferences'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const focusedThemes = await focusedThemesForUser(env, active.userId)
  const url = new URL(request.url)
  const requestedTheme = url.searchParams.get('theme')
  const themes = requestedTheme
    ? focusedThemes.includes(requestedTheme as (typeof focusedThemes)[number]) ? [requestedTheme] : []
    : focusedThemes
  const rows = themes.length ? await env.DB.prepare(`SELECT * FROM (
    SELECT p.*, row_number() OVER (PARTITION BY theme ORDER BY random()) AS theme_rank
    FROM user_planets p WHERE p.user_id != ?1 AND p.archived_at IS NULL AND p.visibility != 'private'
      AND p.theme IN (${themes.map((_, index) => `?${index + 2}`).join(', ')})
  ) WHERE theme_rank <= 10 ORDER BY random() LIMIT 200`).bind(active.userId, ...themes).all<PlanetRow>() : { results: [] as PlanetRow[] }
  const planetIds = rows.results.map((planet) => planet.id)
  const weatherHistoryByPlanet = new Map<string, Array<{ date: string; mood: string; intensity: number }>>()
  // The universe has 20 themes × 10 visible planets, while D1 allows at most
  // 100 bound parameters per query. Read public histories in bounded batches.
  for (let offset = 0; offset < planetIds.length; offset += 100) {
    const batchIds = planetIds.slice(offset, offset + 100)
    const placeholders = batchIds.map((_, index) => `?${index + 1}`).join(', ')
    const history = await env.DB.prepare(`SELECT planet_id, date, mood, intensity FROM (
      SELECT planet_id, date, mood, intensity,
        row_number() OVER (PARTITION BY planet_id ORDER BY date DESC, created_at DESC, id DESC) AS day_rank
      FROM mood_entries
      WHERE planet_id IN (${placeholders}) AND privacy IN ('mood_theme_public', 'billboard_public')
    ) WHERE day_rank <= 7 ORDER BY planet_id, date ASC`).bind(...batchIds).all<{
      planet_id: string
      date: string
      mood: string
      intensity: number
    }>()
    for (const entry of history.results) {
      const samples = weatherHistoryByPlanet.get(entry.planet_id) ?? []
      samples.push({ date: entry.date, mood: entry.mood, intensity: entry.intensity })
      weatherHistoryByPlanet.set(entry.planet_id, samples)
    }
  }
  const billboardsByPlanet = new Map<string, Array<Record<string, unknown>>>()
  if (requestedTheme && planetIds.length) {
    const publicBillboardIds = rows.results.filter((planet) => planet.visibility === 'billboard_public').map((planet) => planet.id)
    for (let offset = 0; offset < publicBillboardIds.length; offset += 100) {
      const batchIds = publicBillboardIds.slice(offset, offset + 100)
      const placeholders = batchIds.map((_, index) => `?${index + 1}`).join(', ')
      const boards = await env.DB.prepare(`SELECT id, planet_id, title, text, doodle_json AS doodle,
        created_at AS createdAt, expires_at AS expiresAt
        FROM planet_billboards WHERE planet_id IN (${placeholders}) AND trim(text) != ''
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        ORDER BY created_at DESC`).bind(...batchIds).all<{
          id: string; planet_id: string; title: string; text: string; doodle: string; createdAt: string; expiresAt: string | null
        }>()
      for (const board of boards.results) {
        const planetBoards = billboardsByPlanet.get(board.planet_id) ?? []
        planetBoards.push({ id: board.id, kind: 'user', title: board.title, text: board.text,
          doodle: parseDoodle(board.doodle), createdAt: board.createdAt, expiresAt: board.expiresAt ?? undefined })
        billboardsByPlanet.set(board.planet_id, planetBoards)
      }
    }
    for (let offset = 0; offset < planetIds.length; offset += 100) {
      const batchIds = planetIds.slice(offset, offset + 100)
      const placeholders = batchIds.map((_, index) => `?${index + 1}`).join(', ')
      const cards = await env.DB.prepare(`SELECT id, planet_id, title, message, action,
        created_at AS createdAt, expires_at AS expiresAt FROM care_cards
        WHERE planet_id IN (${placeholders}) AND published = 1 AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC`).bind(...batchIds).all<{
          id: string; planet_id: string; title: string; message: string; action: string; createdAt: string; expiresAt: string
        }>()
      for (const card of cards.results) {
        const planetBoards = billboardsByPlanet.get(card.planet_id) ?? []
        planetBoards.push({ id: card.id, kind: 'ai', title: card.title, text: `${card.message} ${card.action}`.trim(),
          doodle: [], createdAt: card.createdAt, expiresAt: card.expiresAt })
        billboardsByPlanet.set(card.planet_id, planetBoards)
      }
    }
  }
  return withCookie({ planets: rows.results.map((planet) => ({
    ...publicPlanet(planet, weatherHistoryByPlanet.get(planet.id) ?? []),
    ...(requestedTheme ? { billboards: (billboardsByPlanet.get(planet.id) ?? []).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))) } : {}),
  })) }, active)
}
