import { authenticatedMusicUser, withCookie, json, type Env } from '../../_shared'
import { galaxySelectionOptions, readGalaxyPreferences } from '../../_music-galaxy-preferences'
import { AUDIUS_GENRES, normalizeGalaxyGenres } from '../../../src/music/genres'
import { normalizeGalaxySelections } from '../../../src/music/galaxy-preferences'
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  return withCookie({ ...await readGalaxyPreferences(env, identity.userId), availableGenres: AUDIUS_GENRES }, identity)
}
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await json<Record<string, unknown>>(request)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
    || Object.keys(body).some(k => !['genres','artists','songs'].includes(k))) return withCookie({ error: 'INVALID_GALAXY_PREFERENCES' }, identity, 400)
  const statements = [], now = new Date().toISOString()
  if ('genres' in body) {
    const genres = normalizeGalaxyGenres(body.genres)
    if (!genres) return withCookie({ error: 'INVALID_GENRES' }, identity, 400)
    statements.push(env.DB.prepare(`INSERT INTO music_galaxy_preferences(user_id,genres_json,updated_at) VALUES (?1,?2,?3)
      ON CONFLICT(user_id) DO UPDATE SET genres_json=excluded.genres_json,updated_at=excluded.updated_at`)
      .bind(identity.userId, JSON.stringify(genres), now))
  }
  for (const [field, kind] of [['artists','artist'],['songs','song']] as const) {
    if (!(field in body)) continue
    const ids = normalizeGalaxySelections(body[field])
    if (!ids || (await galaxySelectionOptions(env, kind, ids)).length !== ids.length)
      return withCookie({ error: 'INVALID_GALAXY_SELECTIONS' }, identity, 400)
    statements.push(env.DB.prepare(`INSERT INTO music_galaxy_selection_preferences(user_id,group_by,selection_json,updated_at) VALUES (?1,?2,?3,?4)
      ON CONFLICT(user_id,group_by) DO UPDATE SET selection_json=excluded.selection_json,updated_at=excluded.updated_at`)
      .bind(identity.userId, kind, JSON.stringify(ids), now))
  }
  await env.DB.batch(statements)
  return withCookie({ ...await readGalaxyPreferences(env, identity.userId), availableGenres: AUDIUS_GENRES }, identity)
}
