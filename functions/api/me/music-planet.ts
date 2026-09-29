import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { validateTrackSelection, type MusicTrackSummary } from '../../../src/music-domain'

type MusicPlanetRow = {
  id: string
  display_name: string
  tagline: string
  visibility: 'public' | 'private'
  visual_schema_version: number
  visual_json: string
  created_at: string
  updated_at: string
}

type MusicPlanetTrackRow = {
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

type PlanetInput = {
  displayName?: unknown
  tagline?: unknown
  visibility?: unknown
  trackIds?: unknown
  primaryTrackId?: unknown
}

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key)

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

const limitedText = (value: unknown, maxLength: number, allowEmpty: boolean) => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if ((!allowEmpty && !text) || Array.from(text).length > maxLength) return null
  return text
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

function parseVisual(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function httpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

async function readOwnerPlanet(env: Env, userId: string) {
  const row = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at
    FROM music_planets WHERE owner_user_id = ?1
  `).bind(userId).first<MusicPlanetRow>()
  if (!row) return null

  const { results } = await env.DB.prepare(`
    SELECT c.id, c.title, c.artist_id, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
           c.official_url, c.cover_url, c.duration_seconds,
           t.position, t.is_primary, t.selected_at
    FROM music_planet_tracks t
    JOIN music_track_catalog c ON c.id = t.track_id
    WHERE t.planet_id = ?1
    ORDER BY t.position
  `).bind(row.id).all<MusicPlanetTrackRow>()

  const tracks = results.map((track) => ({
    id: track.id,
    title: track.title,
    artistId: track.artist_id,
    artistName: track.artist_name,
    versionLabel: track.version_label,
    genres: parseStringArray(track.genres_json),
    moodTags: parseStringArray(track.mood_tags_json),
    officialUrl: httpsUrl(track.official_url),
    coverUrl: httpsUrl(track.cover_url),
    durationSeconds: track.duration_seconds,
    position: track.position,
    isPrimary: track.is_primary === 1,
    selectedAt: track.selected_at,
  } satisfies MusicTrackSummary & { position: number; isPrimary: boolean; selectedAt: string }))

  return {
    id: row.id,
    displayName: row.display_name,
    tagline: row.tagline,
    visibility: row.visibility,
    visualSchemaVersion: row.visual_schema_version,
    visual: parseVisual(row.visual_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tracks,
  }
}

async function activeTrackIds(env: Env, trackIds: string[]) {
  const placeholders = trackIds.map((_, index) => `?${index + 1}`).join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id FROM music_track_catalog WHERE is_active = 1 AND id IN (${placeholders})
  `).bind(...trackIds).all<{ id: string }>()
  return results.length === trackIds.length
}

function isValidVisibility(value: unknown): value is 'public' | 'private' {
  return value === 'public' || value === 'private'
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return response({ error: 'UNAUTHENTICATED' }, 401)
  const planet = await readOwnerPlanet(env, identity.userId)
  return response({ planet })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return response({ error: 'UNAUTHENTICATED' }, 401)
  const body = await json<PlanetInput>(request)
  if (!body || typeof body !== 'object') return response({ error: 'INVALID_PLANET' }, 400)

  const displayName = limitedText(body.displayName, 40, false)
  const tagline = body.tagline === undefined ? '' : limitedText(body.tagline, 120, true)
  const visibility = body.visibility === undefined ? 'public' : body.visibility
  const selection = validateTrackSelection(body.trackIds, 'create')
  if (!displayName || tagline === null || !isValidVisibility(visibility) || !selection.ok) {
    return response({ error: selection.ok ? 'INVALID_PLANET' : selection.error }, 400)
  }

  const primaryTrackId = body.primaryTrackId === undefined ? selection.trackIds[0] : body.primaryTrackId
  if (typeof primaryTrackId !== 'string' || !selection.trackIds.includes(primaryTrackId.trim())) {
    return response({ error: 'INVALID_PRIMARY_TRACK' }, 400)
  }
  const normalizedPrimaryId = primaryTrackId.trim()
  if (!await activeTrackIds(env, selection.trackIds)) {
    return response({ error: 'UNKNOWN_OR_INACTIVE_TRACK' }, 400)
  }

  const timestamp = new Date().toISOString()
  const planetId = crypto.randomUUID()
  const statements = [env.DB.prepare(`
    INSERT INTO music_planets
      (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
  `).bind(planetId, identity.userId, displayName, tagline, visibility, timestamp)]

  for (const [position, trackId] of selection.trackIds.entries()) {
    statements.push(env.DB.prepare(`
      INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `).bind(planetId, trackId, position, trackId === normalizedPrimaryId ? 1 : 0, timestamp))
  }

  try {
    await env.DB.batch(statements)
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: music_planets\.owner_user_id/.test(error.message)) {
      return response({ error: 'PLANET_ALREADY_EXISTS' }, 409)
    }
    throw error
  }

  return response({ planet: await readOwnerPlanet(env, identity.userId) }, 201)
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return response({ error: 'UNAUTHENTICATED' }, 401)
  const body = await json<PlanetInput>(request)
  if (!body || typeof body !== 'object') return response({ error: 'INVALID_PLANET_UPDATE' }, 400)

  const current = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility, created_at, updated_at
    FROM music_planets WHERE owner_user_id = ?1
  `).bind(identity.userId).first<MusicPlanetRow>()
  if (!current) return response({ error: 'PLANET_NOT_FOUND' }, 404)

  const hasDisplayName = own(body, 'displayName')
  const hasTagline = own(body, 'tagline')
  const hasVisibility = own(body, 'visibility')
  const hasTrackIds = own(body, 'trackIds')
  const hasPrimaryTrackId = own(body, 'primaryTrackId')
  if (!hasDisplayName && !hasTagline && !hasVisibility && !hasTrackIds && !hasPrimaryTrackId) {
    return response({ error: 'EMPTY_PLANET_UPDATE' }, 400)
  }

  const displayName = hasDisplayName ? limitedText(body.displayName, 40, false) : current.display_name
  const tagline = hasTagline ? limitedText(body.tagline, 120, true) : current.tagline
  const visibility = hasVisibility ? body.visibility : current.visibility
  if (!displayName || tagline === null || !isValidVisibility(visibility)) {
    return response({ error: 'INVALID_PLANET_UPDATE' }, 400)
  }

  const { results: existingTracks } = await env.DB.prepare(`
    SELECT track_id, position, is_primary, selected_at
    FROM music_planet_tracks WHERE planet_id = ?1 ORDER BY position
  `).bind(current.id).all<{ track_id: string; position: number; is_primary: number; selected_at: string }>()
  const existingTrackIds = existingTracks.map((track) => track.track_id)

  let nextTrackIds = existingTrackIds
  if (hasTrackIds) {
    const selection = validateTrackSelection(body.trackIds, 'update')
    if (!selection.ok) return response({ error: selection.error }, 400)
    nextTrackIds = selection.trackIds
    if (!await activeTrackIds(env, nextTrackIds)) return response({ error: 'UNKNOWN_OR_INACTIVE_TRACK' }, 400)
  }

  const requestedPrimary = hasPrimaryTrackId ? body.primaryTrackId : undefined
  if (hasPrimaryTrackId && typeof requestedPrimary !== 'string') {
    return response({ error: 'INVALID_PRIMARY_TRACK' }, 400)
  }
  const retainedPrimary = existingTracks.find((track) => track.is_primary === 1)?.track_id
  const primaryTrackId = hasPrimaryTrackId
    ? (requestedPrimary as string).trim()
    : retainedPrimary && nextTrackIds.includes(retainedPrimary) ? retainedPrimary : nextTrackIds[0]
  if (!primaryTrackId || !nextTrackIds.includes(primaryTrackId)) {
    return response({ error: 'INVALID_PRIMARY_TRACK' }, 400)
  }

  const timestamp = new Date().toISOString()
  const statements = [env.DB.prepare(`
    UPDATE music_planets
    SET display_name = ?1, tagline = ?2, visibility = ?3, updated_at = ?4
    WHERE id = ?5 AND owner_user_id = ?6
  `).bind(displayName, tagline, visibility, timestamp, current.id, identity.userId)]

  if (hasTrackIds) {
    const oldSelectedAt = new Map(existingTracks.map((track) => [track.track_id, track.selected_at]))
    statements.unshift(env.DB.prepare('DELETE FROM music_planet_tracks WHERE planet_id = ?1').bind(current.id))
    for (const [position, trackId] of nextTrackIds.entries()) {
      statements.push(env.DB.prepare(`
        INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `).bind(current.id, trackId, position, trackId === primaryTrackId ? 1 : 0, oldSelectedAt.get(trackId) ?? timestamp))
    }
  } else if (hasPrimaryTrackId) {
    statements.push(env.DB.prepare(`
      UPDATE music_planet_tracks
      SET is_primary = CASE WHEN track_id = ?1 THEN 1 ELSE 0 END
      WHERE planet_id = ?2
    `).bind(primaryTrackId, current.id))
  }

  await env.DB.batch(statements)
  return response({ planet: await readOwnerPlanet(env, identity.userId) })
}
