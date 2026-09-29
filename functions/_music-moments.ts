import { safeHttpsUrl, type Env } from './_shared'

export type MomentInput = {
  trackId?: unknown
  contentText?: unknown
  photoUrl?: unknown
  visibility?: unknown
}

export type MomentRow = {
  id: string
  track_id: string
  content_text: string
  photo_url: string | null
  visibility: 'public' | 'private'
  published_at: string | null
  created_at: string
  updated_at: string
  title: string
  artist_id: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  official_url: string
  cover_url: string | null
  duration_seconds: number | null
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key)

export function stringArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

export function photoUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

export function contentText(value: unknown) {
  if (value === undefined) return ''
  if (typeof value !== 'string') return null
  const text = value.trim()
  return Array.from(text).length <= 500 ? text : null
}

export function mapMoment(row: MomentRow) {
  return {
    id: row.id,
    trackId: row.track_id,
    track: {
      id: row.track_id,
      title: row.title,
      artistId: row.artist_id,
      artistName: row.artist_name,
      versionLabel: row.version_label,
      genres: stringArray(row.genres_json),
      moodTags: stringArray(row.mood_tags_json),
      officialUrl: safeHttpsUrl(row.official_url),
      coverUrl: safeHttpsUrl(row.cover_url),
      durationSeconds: row.duration_seconds,
    },
    contentText: row.content_text,
    photoUrl: safeHttpsUrl(row.photo_url),
    visibility: row.visibility,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ownedPlanetId(env: Env, userId: string) {
  const planet = await env.DB.prepare('SELECT id FROM music_planets WHERE owner_user_id = ?1')
    .bind(userId).first<{ id: string }>()
  return planet?.id ?? null
}

export async function readMoment(env: Env, planetId: string, momentId: string) {
  return env.DB.prepare(`
    SELECT m.id, m.track_id, m.content_text, m.photo_url, m.visibility, m.published_at, m.created_at, m.updated_at,
           c.title, c.artist_id, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
           c.official_url, c.cover_url, c.duration_seconds
    FROM music_moments m
    JOIN music_track_catalog c ON c.id = m.track_id
    WHERE m.id = ?1 AND m.planet_id = ?2
  `).bind(momentId, planetId).first<MomentRow>()
}
