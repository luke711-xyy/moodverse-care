import { json, session, withCookie, type Env } from '../../_shared'
import { focusedThemesForUser, validateFocusedThemes } from '../../_preferences'

type Payload = { focusedThemes?: unknown }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const focusedThemes = await focusedThemesForUser(env, active.userId)
  return withCookie({ focusedThemes }, active)
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const payload = await json<Payload>(request)
  const focusedThemes = validateFocusedThemes(payload?.focusedThemes)
  if (!focusedThemes) return withCookie({ error: 'INVALID_FOCUSED_THEMES', max: 6 }, active, 400)

  const updatedAt = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO user_preferences (user_id, focused_themes_json, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET focused_themes_json = excluded.focused_themes_json,
      updated_at = excluded.updated_at`)
    .bind(active.userId, JSON.stringify(focusedThemes), updatedAt).run()

  return withCookie({ ok: true, focusedThemes }, active)
}
