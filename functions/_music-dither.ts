import { safeHttpsUrl, type Env } from './_shared'
import type { MusicTrackSummary } from '../src/music-domain'
import { isDitherSpec, resolveDitherSpec, validateMusicVisualFeatures, type DitherPlanetSpec } from '../src/music/dither/appearance'
import { DEFAULT_TRACK_ID, DEFAULT_AUDIO_URL } from '../src/music/default-track'

export type CatalogTrackRow = {
  id: string; title: string; artist_id: string; artist_name: string; version_label: string
  genres_json: string; mood_tags_json: string; official_url: string; cover_url: string | null
  duration_seconds: number | null; visual_features_json?: string | null; provider?: string
}
export const CATALOG_VISUAL_COLUMNS = 'c.id, c.title, c.artist_id, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json, c.official_url, c.cover_url, c.duration_seconds, c.visual_features_json, c.provider'
export function parseVisualJson(value: string | null | undefined): unknown {
  try { return JSON.parse(value ?? '{}') } catch { return null }
}
export function catalogTrack(row: CatalogTrackRow): MusicTrackSummary {
  const array = (raw: string) => { const parsed = parseVisualJson(raw); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, 24) : [] }
  const features = validateMusicVisualFeatures(parseVisualJson(row.visual_features_json))
  return { id: row.id, title: row.title, artistId: row.artist_id, artistName: row.artist_name, versionLabel: row.version_label,
    genres: array(row.genres_json), moodTags: array(row.mood_tags_json), officialUrl: safeHttpsUrl(row.official_url),
    coverUrl: safeHttpsUrl(row.cover_url), durationSeconds: row.duration_seconds,
    ...(row.id === DEFAULT_TRACK_ID ? { audioUrl: DEFAULT_AUDIO_URL } : {}),
    ...(features.ok ? { visualFeatures: features.value } : {}), ...(row.provider === 'moodverse-demo' ? { isDemo: true } : {}),
  }
}
export async function readVisualCatalogTracks(env: Env, ids: string[], primaryId: string) {
  if (!ids.length) return []
  const rows = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c
    WHERE c.is_active = 1 AND c.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<CatalogTrackRow>()
  const map = new Map(rows.results.map((row) => [row.id, catalogTrack(row)]))
  return ids.flatMap((id) => { const track = map.get(id); return track ? [{ ...track, isPrimary: id === primaryId }] : [] })
}

/** Authoritative read adapter. Batch only legacy/malformed rows, never N+1.
 * No Moment text, account details or arbitrary legacy JSON enters the spec. */
export async function readPlanetDitherVisuals(env: Env, planets: Array<{ id: string; visual_json: string }>) {
  const output = new Map<string, DitherPlanetSpec>(), pending: typeof planets = []
  for (const row of planets) {
    const parsed = parseVisualJson(row.visual_json)
    if (isDitherSpec(parsed) && parsed.seed === row.id) output.set(row.id, parsed)
    else pending.push(row)
  }
  for (let start = 0; start < pending.length; start += 80) {
    const chunk = pending.slice(start, start + 80)
    const result = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS}, t.planet_id, t.is_primary
      FROM music_planet_tracks t JOIN music_track_catalog c ON c.id = t.track_id
      WHERE t.planet_id IN (${chunk.map(() => '?').join(',')}) ORDER BY t.planet_id, t.position`)
      .bind(...chunk.map((p) => p.id)).all<CatalogTrackRow & { planet_id: string; is_primary: number }>()
    const tracks = new Map<string, Array<MusicTrackSummary & { isPrimary: boolean }>>()
    for (const row of result.results) {
      const list = tracks.get(row.planet_id) ?? []; list.push({ ...catalogTrack(row), isPrimary: row.is_primary === 1 }); tracks.set(row.planet_id, list)
    }
    for (const row of chunk) output.set(row.id, resolveDitherSpec(row.id, tracks.get(row.id) ?? [], null))
  }
  return output
}
