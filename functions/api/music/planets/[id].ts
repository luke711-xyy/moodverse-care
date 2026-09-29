import { safeHttpsUrl, type Env } from '../../../_shared'
import type { MusicTrackSummary } from '../../../../src/music-domain'
import { mapMoment, type MomentRow, stringArray } from '../../../_music-moments'

type PublicPlanetRow = {
  id: string
  display_name: string
  tagline: string
  visibility: 'public' | 'private'
  visual_schema_version: number
  visual_json: string
  created_at: string
  updated_at: string
}

type PublicTrackRow = {
  id: string
  title: string
  artist_id: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  official_url: string
  cover_url: string | null
  duration_seconds: number | null
  position: number
  is_primary: number
  selected_at: string
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

function visualObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function trackSummary(row: PublicTrackRow): MusicTrackSummary & {
  position: number
  isPrimary: boolean
  selectedAt: string
} {
  return {
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
    position: row.position,
    isPrimary: row.is_primary === 1,
    selectedAt: row.selected_at,
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const planetId = typeof params?.id === 'string' ? params.id.trim() : ''
  if (!planetId || planetId.length > 128) return respond({ error: 'PLANET_NOT_FOUND' }, 404)

  const row = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
    FROM music_planets
    WHERE id = ?1 AND visibility = 'public'
  `).bind(planetId).first<PublicPlanetRow>()
  if (!row) return respond({ error: 'PLANET_NOT_FOUND' }, 404)

  const [{ results: trackRows }, { results: momentRows }] = await Promise.all([
    env.DB.prepare(`
      SELECT c.id, c.title, c.artist_id, c.artist_name, c.version_label, c.genres_json,
             c.mood_tags_json, c.official_url, c.cover_url, c.duration_seconds,
             t.position, t.is_primary, t.selected_at
      FROM music_planet_tracks t
      JOIN music_track_catalog c ON c.id = t.track_id
      WHERE t.planet_id = ?1 AND c.is_active = 1
      ORDER BY t.position
    `).bind(row.id).all<PublicTrackRow>(),
    env.DB.prepare(`
      SELECT m.id, m.track_id, m.content_text, m.photo_url, m.visibility, m.published_at,
             m.created_at, m.updated_at, c.title, c.artist_id, c.artist_name, c.version_label,
             c.genres_json, c.mood_tags_json, c.official_url, c.cover_url, c.duration_seconds
      FROM music_moments m
      JOIN music_planets p ON p.id = m.planet_id
      JOIN music_track_catalog c ON c.id = m.track_id
      WHERE m.planet_id = ?1
        AND p.visibility = 'public'
        AND m.visibility = 'public'
        AND m.published_at IS NOT NULL
        AND c.is_active = 1
      ORDER BY m.published_at DESC, m.created_at DESC, m.id DESC
    `).bind(row.id).all<MomentRow>(),
  ])

  return respond({
    planet: {
      id: row.id,
      displayName: row.display_name,
      tagline: row.tagline,
      visibility: row.visibility,
      visualSchemaVersion: row.visual_schema_version,
      visual: visualObject(row.visual_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tracks: trackRows.map(trackSummary),
      moments: momentRows.map(mapMoment),
    },
  })
}
