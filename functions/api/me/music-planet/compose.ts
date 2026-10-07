import { authenticatedMusicUser, type Env } from '../../../_shared'

const COMPOSITION_REQUEST_SCHEMA_VERSION = 1
const VISUAL_SCHEMA_VERSION = 2
const MAX_GATEWAY_RESPONSE_CHARS = 8_192
const MAX_COMPOSER_MOMENTS = 20

type TrackRow = {
  id: string
  title: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  position: number
  is_primary: number
}

type MomentRow = {
  id: string
  track_id: string
  content_text: string
  created_at: string
}

type CompositionInput = {
  schemaVersion: number
  planet: { id: string; displayName: string; tagline: string; visibility: 'public' | 'private' }
  selectedTracks: Array<{
    id: string
    title: string
    artistName: string
    versionLabel: string
    genres: string[]
    moodTags: string[]
    position: number
    isPrimary: boolean
  }>
  publicMoments: Array<{ id: string; trackId: string; contentText: string; createdAt: string }>
}

type PlanetVisual = {
  schemaVersion: 2
  summary: string
  palette: { surface: string; ocean: string; accent: string }
  atmosphere: 'clear' | 'mist' | 'nebula' | 'starlit'
  motion: 'still' | 'drift' | 'flow' | 'pulse'
  particleDensity: number
  terrainFeatures: { mountainRanges: number; basins: number; canyons: number; escarpments: number }
}

type GatewayResult = {
  model: { name: string; version: string }
  output: PlanetVisual
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

function parseArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : []
  } catch {
    return []
  }
}

async function readCompositionInput(env: Env, userId: string) {
  const planet = await env.DB.prepare(`
    SELECT id, display_name, tagline, visibility
    FROM music_planets WHERE owner_user_id = ?1
  `).bind(userId).first<{
    id: string
    display_name: string
    tagline: string
    visibility: 'public' | 'private'
  }>()
  if (!planet) return null

  const [tracks, moments] = await Promise.all([
    env.DB.prepare(`
      SELECT c.id, c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
             t.position, t.is_primary
      FROM music_planet_tracks t
      JOIN music_track_catalog c ON c.id = t.track_id
      WHERE t.planet_id = ?1
      ORDER BY t.position
    `).bind(planet.id).all<TrackRow>(),
    // Private Moments never enter a scene that can be visible to other people.
    // Photos and playback URLs are intentionally excluded from this text model contract.
    env.DB.prepare(`
      SELECT id, track_id, content_text, created_at
      FROM music_moments
      WHERE planet_id = ?1 AND visibility = 'public' AND published_at IS NOT NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT ${MAX_COMPOSER_MOMENTS}
    `).bind(planet.id).all<MomentRow>(),
  ])

  const input: CompositionInput = {
    schemaVersion: COMPOSITION_REQUEST_SCHEMA_VERSION,
    planet: {
      id: planet.id,
      displayName: planet.display_name,
      tagline: planet.tagline,
      visibility: planet.visibility,
    },
    selectedTracks: tracks.results.map((track) => ({
      id: track.id,
      title: track.title,
      artistName: track.artist_name,
      versionLabel: track.version_label,
      genres: parseArray(track.genres_json),
      moodTags: parseArray(track.mood_tags_json),
      position: track.position,
      isPrimary: track.is_primary === 1,
    })),
    publicMoments: moments.results.map((moment) => ({
      id: moment.id,
      trackId: moment.track_id,
      contentText: moment.content_text.slice(0, 500),
      createdAt: moment.created_at,
    })),
  }
  return { planetId: planet.id, input }
}

async function hashInput(input: CompositionInput) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function validateVisual(value: unknown): PlanetVisual | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'summary', 'palette', 'atmosphere', 'motion', 'particleDensity', 'terrainFeatures',
  ])) return null
  if (value.schemaVersion !== VISUAL_SCHEMA_VERSION) return null
  if (typeof value.summary !== 'string' || !value.summary.trim() || Array.from(value.summary.trim()).length > 120) return null
  if (typeof value.atmosphere !== 'string' || !['clear', 'mist', 'nebula', 'starlit'].includes(value.atmosphere)) return null
  if (typeof value.motion !== 'string' || !['still', 'drift', 'flow', 'pulse'].includes(value.motion)) return null
  if (typeof value.particleDensity !== 'number' || !Number.isFinite(value.particleDensity) || value.particleDensity < 0 || value.particleDensity > 1) return null
  if (!isRecord(value.palette) || !hasExactKeys(value.palette, ['surface', 'ocean', 'accent'])) return null
  if (!isRecord(value.terrainFeatures) || !hasExactKeys(value.terrainFeatures, [
    'mountainRanges', 'basins', 'canyons', 'escarpments',
  ])) return null
  const terrainFeatureLimits = { mountainRanges: 6, basins: 4, canyons: 5, escarpments: 4 } as const
  for (const [feature, maximum] of Object.entries(terrainFeatureLimits)) {
    const count = value.terrainFeatures[feature]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > maximum) return null
  }

  const colors = [value.palette.surface, value.palette.ocean, value.palette.accent]
  if (!colors.every((color) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))) return null

  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    summary: value.summary.trim(),
    palette: {
      surface: (value.palette.surface as string).toLowerCase(),
      ocean: (value.palette.ocean as string).toLowerCase(),
      accent: (value.palette.accent as string).toLowerCase(),
    },
    atmosphere: value.atmosphere as PlanetVisual['atmosphere'],
    motion: value.motion as PlanetVisual['motion'],
    particleDensity: value.particleDensity,
    terrainFeatures: {
      mountainRanges: value.terrainFeatures.mountainRanges as number,
      basins: value.terrainFeatures.basins as number,
      canyons: value.terrainFeatures.canyons as number,
      escarpments: value.terrainFeatures.escarpments as number,
    },
  }
}

function gatewayUrl(env: Env) {
  if (!env.MUSIC_AI_GATEWAY_URL?.trim()) return null
  try {
    const url = new URL(env.MUSIC_AI_GATEWAY_URL)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function validateGatewayResult(value: unknown): GatewayResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ['model', 'output']) || !isRecord(value.model)) return null
  if (!hasExactKeys(value.model, ['name', 'version'])) return null
  const name = typeof value.model.name === 'string' ? value.model.name.trim() : ''
  const version = typeof value.model.version === 'string' ? value.model.version.trim() : ''
  const output = validateVisual(value.output)
  if (!name || name.length > 80 || !version || version.length > 80 || !output) return null
  return { model: { name, version }, output }
}

type QueueResult =
  | { state: 'not_configured' }
  | { state: 'planet_not_found' }
  | { state: 'no_tracks' }
  | { state: 'queued'; taskId: string }

export async function schedulePlanetComposition(
  env: Env,
  userId: string,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<QueueResult> {
  const endpoint = gatewayUrl(env)
  const gatewayToken = env.MUSIC_AI_GATEWAY_TOKEN?.trim()
  if (!endpoint || !env.MUSIC_AI_ACCESS_CLIENT_ID?.trim() || !env.MUSIC_AI_ACCESS_CLIENT_SECRET?.trim() || !gatewayToken) {
    return { state: 'not_configured' }
  }

  const composition = await readCompositionInput(env, userId)
  if (!composition) return { state: 'planet_not_found' }
  if (!composition.input.selectedTracks.length) return { state: 'no_tracks' }

  const taskId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const inputHash = await hashInput(composition.input)
  await env.DB.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version,
       schema_version, input_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'planet_composer', 'queued', 'local-gateway', 'pending', ?4, ?5, ?6, ?6)
  `).bind(taskId, userId, composition.planetId, VISUAL_SCHEMA_VERSION, inputHash, timestamp).run()

  waitUntil(processComposition(env, taskId, userId, composition.planetId, composition.input, inputHash, endpoint))
  return { state: 'queued', taskId }
}

async function markFailed(env: Env, taskId: string, errorCode: string, latencyMs: number) {
  await env.DB.prepare(`
    UPDATE music_ai_tasks
    SET status = 'failed', error_code = ?2, latency_ms = ?3, updated_at = ?4
    WHERE id = ?1
  `).bind(taskId, errorCode, Math.max(0, Math.round(latencyMs)), new Date().toISOString()).run()
}

async function processComposition(
  env: Env,
  taskId: string,
  userId: string,
  planetId: string,
  input: CompositionInput,
  inputHash: string,
  endpoint: string,
) {
  const start = Date.now()
  await env.DB.prepare(`
    UPDATE music_ai_tasks SET status = 'running', updated_at = ?2 WHERE id = ?1 AND status = 'queued'
  `).bind(taskId, new Date().toISOString()).run()

  let result: GatewayResult | null = null
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'Cf-Access-Client-Id': env.MUSIC_AI_ACCESS_CLIENT_ID!,
        'Cf-Access-Client-Secret': env.MUSIC_AI_ACCESS_CLIENT_SECRET!,
        authorization: `Bearer ${env.MUSIC_AI_GATEWAY_TOKEN!.trim()}`,
      },
      body: JSON.stringify({ taskId, schemaVersion: COMPOSITION_REQUEST_SCHEMA_VERSION, ...input }),
      redirect: 'error',
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) {
      await markFailed(env, taskId, 'AI_GATEWAY_UNAVAILABLE', Date.now() - start)
      return
    }
    const raw = await response.text()
    if (raw.length > MAX_GATEWAY_RESPONSE_CHARS) {
      await markFailed(env, taskId, 'AI_RESULT_INVALID', Date.now() - start)
      return
    }
    try {
      result = validateGatewayResult(JSON.parse(raw))
    } catch {
      result = null
    }
  } catch {
    await markFailed(env, taskId, 'AI_GATEWAY_UNAVAILABLE', Date.now() - start)
    return
  }

  if (!result) {
    await markFailed(env, taskId, 'AI_RESULT_INVALID', Date.now() - start)
    return
  }

  const current = await readCompositionInput(env, userId)
  if (!current || current.planetId !== planetId || await hashInput(current.input) !== inputHash) {
    await markFailed(env, taskId, 'AI_INPUT_CHANGED', Date.now() - start)
    return
  }

  const timestamp = new Date().toISOString()
  const visualJson = JSON.stringify(result.output)
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE music_planets SET visual_schema_version = ?3, visual_json = ?4, updated_at = ?5
      WHERE id = ?1 AND owner_user_id = ?2
    `).bind(planetId, userId, VISUAL_SCHEMA_VERSION, visualJson, timestamp),
    env.DB.prepare(`
      UPDATE music_ai_tasks
      SET status = 'succeeded', model_name = ?2, model_version = ?3, result_json = ?4,
          latency_ms = ?5, error_code = NULL, updated_at = ?6
      WHERE id = ?1
    `).bind(taskId, result.model.name, result.model.version, visualJson, Math.max(0, Math.round(Date.now() - start)), timestamp),
  ])
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const scheduled = await schedulePlanetComposition(env, identity.userId, (task) => context.waitUntil(task))
  if (scheduled.state === 'not_configured') return respond({ error: 'AI_GATEWAY_NOT_CONFIGURED' }, 503)
  if (scheduled.state === 'planet_not_found') return respond({ error: 'PLANET_NOT_FOUND' }, 404)
  if (scheduled.state === 'no_tracks') return respond({ error: 'PLANET_HAS_NO_TRACKS' }, 409)
  return respond({ task: { id: scheduled.taskId, kind: 'planet_composer', status: 'queued' } }, 202)
}
