import { safeHttpsUrl, type Env } from '../../_shared'
import type { MusicTrackSummary } from '../../../src/music-domain'

type CatalogRow = {
  id: string
  title: string
  artist_id: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  provider: string
  official_url: string
  cover_url: string | null
  duration_seconds: number | null
}

function stringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, 24)
  } catch {
    return []
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) ?? ''
  const { results } = await env.DB.prepare(`
    SELECT id, title, artist_id, artist_name, version_label, genres_json, mood_tags_json, provider,
           official_url, cover_url, duration_seconds
    FROM music_track_catalog
    WHERE is_active = 1
      AND (?1 = '' OR instr(lower(title), lower(?1)) > 0 OR instr(lower(artist_name), lower(?1)) > 0)
    ORDER BY title COLLATE NOCASE, artist_name COLLATE NOCASE, id
    LIMIT 50
  `).bind(search).all<CatalogRow>()

  const tracks: MusicTrackSummary[] = results.map((row) => ({
    id: row.id,
    title: row.title,
    artistId: row.artist_id,
    artistName: row.artist_name,
    versionLabel: row.version_label,
    genres: stringArray(row.genres_json),
    moodTags: stringArray(row.mood_tags_json),
    officialUrl: safeHttpsUrl(row.official_url),
    coverUrl: safeHttpsUrl(row.cover_url),
    durationSeconds: row.duration_seconds,
    ...(row.provider === 'moodverse-demo' ? { isDemo: true } : {}),
  }))

  return new Response(JSON.stringify({ tracks }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
}
