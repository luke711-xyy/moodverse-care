import { json, safeText, session, withCookie, type Env } from '../../../_shared'
import type { PlanetRow } from '../../../_planet'

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const active = await session(request, env)
  const body = await json<{ text?: unknown; doodle?: unknown }>(request)
  const message = safeText(body?.text, 160)
  const doodle = JSON.stringify(Array.isArray(body?.doodle) ? body.doodle.slice(0, 200) : [])
  if ((!message && doodle === '[]') || doodle.length > 50000) return withCookie({ error: 'EMPTY_REPLY' }, active, 400)
  const target = await env.DB.prepare(`SELECT * FROM user_planets
    WHERE id = ?1 AND archived_at IS NULL AND visibility = 'billboard_public'`)
    .bind(params.id).first<PlanetRow>()
  if (!target) return withCookie({ error: 'NOT_FOUND' }, active, 404)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO replies
    (id, planet_user_id, planet_id, author_user_id, text, doodle_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(id, target.user_id, target.id, active.userId, message, doodle, createdAt).run()
  return withCookie({ ok: true, reply: { id, text: message, doodle, createdAt } }, active)
}
