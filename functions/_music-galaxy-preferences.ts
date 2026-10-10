import { type Env } from './_shared'
import { DEFAULT_GALAXY_GENRES, normalizeGalaxyGenres } from '../src/music/genres'
import { normalizeGalaxySelections, type GalaxySelectionKind, type GalaxySelectionOption } from '../src/music/galaxy-preferences'
export async function readGalaxyGenres(env: Env, userId?: string) {
  if (!userId) return DEFAULT_GALAXY_GENRES
  const row = await env.DB.prepare('SELECT genres_json FROM music_galaxy_preferences WHERE user_id=?1').bind(userId).first<{ genres_json: string }>()
  try { return normalizeGalaxyGenres(JSON.parse(row?.genres_json ?? 'null')) ?? DEFAULT_GALAXY_GENRES } catch { return DEFAULT_GALAXY_GENRES }
}

export async function readGalaxySelectionIds(env: Env, kind: GalaxySelectionKind, userId?: string): Promise<string[]> {
  if (!userId) return []
  const row = await env.DB.prepare('SELECT selection_json FROM music_galaxy_selection_preferences WHERE user_id=?1 AND group_by=?2')
    .bind(userId, kind).first<{ selection_json: string }>()
  try { return normalizeGalaxySelections(JSON.parse(row?.selection_json ?? '[]')) ?? [] } catch { return [] }
}

export async function galaxySelectionOptions(env: Env, kind: GalaxySelectionKind, ids: string[], activeOnly = true): Promise<GalaxySelectionOption[]> {
  if (!ids.length) return []
  const { results } = await env.DB.prepare(kind === 'artist' ? `
    SELECT c.artist_id AS id, min(c.artist_name) AS label FROM json_each(?1) j
    JOIN music_track_catalog c ON c.artist_id=j.value
    WHERE c.provider<>'moodverse-demo' AND (?2=0 OR c.is_active=1)
    GROUP BY c.artist_id ORDER BY min(CAST(j.key AS INTEGER))` : `
    SELECT c.id, c.title || ' · ' || c.artist_name AS label FROM json_each(?1) j
    JOIN music_track_catalog c ON c.id=j.value
    WHERE c.provider<>'moodverse-demo' AND (?2=0 OR c.is_active=1)
    ORDER BY CAST(j.key AS INTEGER)`)
    .bind(JSON.stringify(ids), activeOnly ? 1 : 0).all<GalaxySelectionOption>()
  return results
}

export async function readGalaxyPreferences(env: Env, userId: string) {
  const [genres, artists, songs] = await Promise.all([readGalaxyGenres(env, userId),
    readGalaxySelectionIds(env, 'artist', userId).then(ids => galaxySelectionOptions(env, 'artist', ids, false)),
    readGalaxySelectionIds(env, 'song', userId).then(ids => galaxySelectionOptions(env, 'song', ids, false))])
  return { genres, artists, songs }
}
