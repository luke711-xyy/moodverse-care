import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { ensureDefaultFriendSatellites, readFriendSatellites } from '../../_music-friend-satellites'
import { validateTrackSelection, type MusicTrackSummary } from '../../../src/music-domain'
import { catalogTrack, parseVisualJson, readVisualCatalogTracks, CATALOG_VISUAL_COLUMNS } from '../../_music-dither'
import { createDitherSpec, resolveDitherSpec, validateDitherOverrides } from '../../../src/music/dither/appearance'
import { DEFAULT_TRACK_ID } from '../../../src/music/default-track'

type MusicPlanetRow = {
  id: string
  display_name: string
  tagline: string
  visibility: 'public' | 'private'
  visual_schema_version: number
  visual_json: string
  visual_revision: number
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
  visual_features_json: string | null
}

type PlanetInput = {
  displayName?: unknown
  tagline?: unknown
  visibility?: unknown
  trackIds?: unknown
  primaryTrackId?: unknown
  appearanceOverrides?: unknown
  appearanceRevision?: unknown
}

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key)

const response = (body: unknown, status = 200, setCookie?: string | null) => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

const limitedText = (value: unknown, maxLength: number, allowEmpty: boolean) => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if ((!allowEmpty && !text) || Array.from(text).length > maxLength) return null
  return text
}

async function readOwnerPlanet(env: Env, userId: string) {
  const row = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility, visual_schema_version, visual_json, visual_revision, created_at, updated_at
    FROM music_planets WHERE owner_user_id = ?1
  `).bind(userId).first<MusicPlanetRow>()
  if (!row) return null

  const { results } = await env.DB.prepare(`
    SELECT ${CATALOG_VISUAL_COLUMNS},
           t.position, t.is_primary, t.selected_at
    FROM music_planet_tracks t
    JOIN music_track_catalog c ON c.id = t.track_id
    WHERE t.planet_id = ?1
    ORDER BY t.position
  `).bind(row.id).all<MusicPlanetTrackRow>()

  const tracks = results.map((track) => ({
    ...catalogTrack(track),
    position: track.position,
    isPrimary: track.is_primary === 1,
    selectedAt: track.selected_at,
  } satisfies MusicTrackSummary & { position: number; isPrimary: boolean; selectedAt: string }))

  return {
    id: row.id,
    displayName: row.display_name,
    tagline: row.tagline,
    visibility: row.visibility,
    visualSchemaVersion: 3,
    appearanceRevision: row.visual_revision,
    visual: resolveDitherSpec(row.id, tracks, parseVisualJson(row.visual_json)),
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
  await ensureDefaultFriendSatellites(env, identity.userId)
  const planet = await readOwnerPlanet(env, identity.userId)
  const demoEmail = env.MUSIC_DEMO_EMAIL?.trim().toLocaleLowerCase() ?? ''
  const accountEmail = identity.email?.trim().toLocaleLowerCase() ?? ''
  const friendSatellites = await readFriendSatellites(env, identity.userId)
  return response({ planet, friendSatellites, isDemoAccount: Boolean(demoEmail && accountEmail && demoEmail === accountEmail) }, 200, identity.setCookie)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
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

  const primaryTrackId = body.primaryTrackId === undefined
    ? selection.trackIds.includes(DEFAULT_TRACK_ID) ? DEFAULT_TRACK_ID : selection.trackIds[0]
    : body.primaryTrackId
  if (typeof primaryTrackId !== 'string' || !selection.trackIds.includes(primaryTrackId.trim())) {
    return response({ error: 'INVALID_PRIMARY_TRACK' }, 400)
  }
  const normalizedPrimaryId = primaryTrackId.trim()
  if (!await activeTrackIds(env, selection.trackIds)) {
    return response({ error: 'UNKNOWN_OR_INACTIVE_TRACK' }, 400)
  }

  const timestamp = new Date().toISOString()
  const planetId = crypto.randomUUID()
  const tracks = await readVisualCatalogTracks(env, selection.trackIds, normalizedPrimaryId)
  const overrides = validateDitherOverrides(body.appearanceOverrides === undefined ? {} : body.appearanceOverrides)
  if (!overrides.ok) return response({ error: 'INVALID_APPEARANCE_OVERRIDES' }, 400)
  const visual = createDitherSpec({ planetId, tracks, overrides: overrides.value })
  const statements = [env.DB.prepare(`
    INSERT INTO music_planets
      (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at, visual_schema_version, visual_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 3, ?7)
  `).bind(planetId, identity.userId, displayName, tagline, visibility, timestamp, JSON.stringify(visual))]

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

  const planet = await readOwnerPlanet(env, identity.userId)
  return response({ planet }, 201)
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return response({ error: 'UNAUTHENTICATED' }, 401)
  const body = await json<PlanetInput>(request)
  if (!body || typeof body !== 'object') return response({ error: 'INVALID_PLANET_UPDATE' }, 400)

  const current = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility, visual_schema_version, visual_json, visual_revision, created_at, updated_at
    FROM music_planets WHERE owner_user_id = ?1
  `).bind(identity.userId).first<MusicPlanetRow>()
  if (!current) return response({ error: 'PLANET_NOT_FOUND' }, 404)

  const hasDisplayName = own(body, 'displayName')
  const hasTagline = own(body, 'tagline')
  const hasVisibility = own(body, 'visibility')
  const hasTrackIds = own(body, 'trackIds')
  const hasPrimaryTrackId = own(body, 'primaryTrackId')
  const hasOverrides = own(body, 'appearanceOverrides')
  const overrides = hasOverrides ? validateDitherOverrides(body.appearanceOverrides) : null
  if (hasOverrides && !overrides?.ok) return response({ error: 'INVALID_APPEARANCE_OVERRIDES' }, 400)
  if (own(body, 'appearanceRevision') && (!Number.isInteger(body.appearanceRevision) || body.appearanceRevision !== current.visual_revision)) {
    return response({ error: 'APPEARANCE_CONFLICT' }, 409)
  }
  if (!hasDisplayName && !hasTagline && !hasVisibility && !hasTrackIds && !hasPrimaryTrackId && !hasOverrides) {
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
  const writeToken = crypto.randomUUID()
  const tracks = await readVisualCatalogTracks(env, nextTrackIds, primaryTrackId)
  // Selected inactive tracks retain their metadata and appearance until replaced.
  if (tracks.length !== nextTrackIds.length && !hasTrackIds) {
    const { results } = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c
      WHERE c.id IN (${nextTrackIds.map(() => '?').join(',')})`).bind(...nextTrackIds).all<MusicPlanetTrackRow>()
    tracks.splice(0, tracks.length, ...nextTrackIds.map((id) => ({ ...catalogTrack(results.find((r) => r.id === id)!), isPrimary: id === primaryTrackId })))
  }
  const visual = createDitherSpec({ planetId: current.id, tracks, previous: parseVisualJson(current.visual_json), ...(overrides?.ok ? { overrides: overrides.value } : {}) })
  const statements = [env.DB.prepare(`
    UPDATE music_planets
    SET display_name = ?1, tagline = ?2, visibility = ?3, updated_at = ?4,
        legacy_visual_json = COALESCE(legacy_visual_json, CASE WHEN visual_schema_version < 3 THEN visual_json END),
        visual_schema_version = 3, visual_json = ?7, visual_revision = visual_revision + 1, visual_write_token = ?9
    WHERE id = ?5 AND owner_user_id = ?6 AND visual_revision = ?8
  `).bind(displayName, tagline, visibility, timestamp, current.id, identity.userId, JSON.stringify(visual), current.visual_revision, writeToken)]

  if (hasTrackIds) {
    const oldSelectedAt = new Map(existingTracks.map((track) => [track.track_id, track.selected_at]))
    statements.push(env.DB.prepare('DELETE FROM music_planet_tracks WHERE planet_id = ?1 AND EXISTS (SELECT 1 FROM music_planets WHERE id=?1 AND visual_write_token=?2)').bind(current.id, writeToken))
    for (const [position, trackId] of nextTrackIds.entries()) {
      statements.push(env.DB.prepare(`
        INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
        SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM music_planets WHERE id=?1 AND visual_write_token=?6)
      `).bind(current.id, trackId, position, trackId === primaryTrackId ? 1 : 0, oldSelectedAt.get(trackId) ?? timestamp, writeToken))
    }
  } else if (hasPrimaryTrackId) {
    statements.push(env.DB.prepare(`
      UPDATE music_planet_tracks
      SET is_primary = CASE WHEN track_id = ?1 THEN 1 ELSE 0 END
      WHERE planet_id = ?2 AND EXISTS (SELECT 1 FROM music_planets WHERE id=?2 AND visual_write_token=?3)
    `).bind(primaryTrackId, current.id, writeToken))
  }

  const writes = await env.DB.batch(statements)
  if (writes[0].meta.changes !== 1) return response({ error: 'APPEARANCE_CONFLICT' }, 409)
  const planet = await readOwnerPlanet(env, identity.userId)
  return response({ planet })
}
