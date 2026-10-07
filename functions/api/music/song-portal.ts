import { authenticatedMusicUser, type Env } from '../../_shared'
import { stringArray } from '../../_music-moments'

const RANK_SCHEMA_VERSION = 1
const MAX_GATEWAY_RESPONSE_CHARS = 16_384
const MAX_PUBLIC_MOMENT_CHARS = 160
const MAX_TRACK_TAGS = 12
const RANK_TIMEOUT_MS = 45_000

type MatchSource = 'active_selection' | 'public_moment' | 'active_selection_and_public_moment'
type ReasonCode = 'shared_song_selection' | 'shared_public_moment' | 'shared_selection_and_moment'
type RankStatus = 'not_configured' | 'no_candidates' | 'ready' | 'gateway_unavailable' | 'invalid_output' | 'input_changed'

type TrackRow = {
  id: string
  title: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
}

type PortalMatchRow = {
  planet_id: string
  display_name: string
  tagline: string
  selected_at: string | null
  latest_public_moment_at: string | null
  latest_public_moment_text: string | null
}

type PublicMatch = {
  planetId: string
  displayName: string
  tagline: string
  matchSource: MatchSource
  selectedAt: string | null
  latestPublicMomentAt: string | null
}

type RankInput = {
  schemaVersion: number
  track: {
    id: string
    title: string
    artistName: string
    versionLabel: string
    genres: string[]
    moodTags: string[]
  }
  candidates: Array<{
    planetId: string
    displayName: string
    tagline: string
    matchSource: MatchSource
    publicMomentText: string | null
  }>
}

type RankedCandidate = {
  planetId: string
  score: number
  reasonCode: ReasonCode
}

type ModelRank = {
  model: { name: string; version: string }
  ranking: RankedCandidate[]
}

type RankingOutcome = {
  mode: 'stable_fallback' | 'model'
  status: RankStatus
  model: { name: string; version: string } | null
  taskId: string | null
  ranking: RankedCandidate[] | null
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function matchSource(row: PortalMatchRow): MatchSource {
  if (row.selected_at && row.latest_public_moment_at) return 'active_selection_and_public_moment'
  return row.selected_at ? 'active_selection' : 'public_moment'
}

function fallbackReason(source: MatchSource): ReasonCode {
  if (source === 'active_selection_and_public_moment') return 'shared_selection_and_moment'
  return source === 'active_selection' ? 'shared_song_selection' : 'shared_public_moment'
}

function publicMatch(row: PortalMatchRow): PublicMatch {
  return {
    planetId: row.planet_id,
    displayName: row.display_name,
    tagline: row.tagline,
    matchSource: matchSource(row),
    selectedAt: row.selected_at,
    latestPublicMomentAt: row.latest_public_moment_at,
  }
}

function parseTrackTags(value: string) {
  return stringArray(value).slice(0, MAX_TRACK_TAGS)
}

function rankInput(track: TrackRow, candidates: PortalMatchRow[]): RankInput {
  return {
    schemaVersion: RANK_SCHEMA_VERSION,
    track: {
      id: track.id,
      title: track.title,
      artistName: track.artist_name,
      versionLabel: track.version_label,
      genres: parseTrackTags(track.genres_json),
      moodTags: parseTrackTags(track.mood_tags_json),
    },
    candidates: candidates.map((row) => ({
      planetId: row.planet_id,
      displayName: row.display_name.slice(0, 80),
      tagline: row.tagline.slice(0, 160),
      matchSource: matchSource(row),
      publicMomentText: row.latest_public_moment_text
        ? Array.from(row.latest_public_moment_text.trim()).slice(0, MAX_PUBLIC_MOMENT_CHARS).join('')
        : null,
    })),
  }
}

async function hashInput(input: RankInput) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function gatewayUrl(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function validateModelRank(value: unknown, candidates: PortalMatchRow[]): ModelRank | null {
  if (!isRecord(value) || !hasExactKeys(value, ['model', 'ranking']) || !isRecord(value.model)) return null
  if (!hasExactKeys(value.model, ['name', 'version']) || !Array.isArray(value.ranking)) return null

  const name = typeof value.model.name === 'string' ? value.model.name.trim() : ''
  const version = typeof value.model.version === 'string' ? value.model.version.trim() : ''
  if (!name || name.length > 80 || !version || version.length > 80) return null
  if (value.ranking.length !== candidates.length) return null

  const candidateSources = new Map(candidates.map((row) => [row.planet_id, matchSource(row)]))
  const seen = new Set<string>()
  const ranking: RankedCandidate[] = []
  for (const item of value.ranking) {
    if (!isRecord(item) || !hasExactKeys(item, ['planetId', 'score'])) return null
    if (typeof item.planetId !== 'string' || seen.has(item.planetId)) return null
    const source = candidateSources.get(item.planetId)
    if (!source) return null
    if (typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) return null
    seen.add(item.planetId)
    ranking.push({ planetId: item.planetId, score: item.score, reasonCode: fallbackReason(source) })
  }

  if (seen.size !== candidates.length) return null
  return {
    model: { name, version },
    ranking: ranking.sort((left, right) => right.score - left.score),
  }
}

async function readCandidates(env: Env, trackId: string, viewerUserId: string) {
  const { results } = await env.DB.prepare(`
    SELECT p.id AS planet_id, p.display_name, p.tagline,
      (
        SELECT t.selected_at
        FROM music_planet_tracks t
        WHERE t.planet_id = p.id AND t.track_id = c.id
        LIMIT 1
      ) AS selected_at,
      (
        SELECT m.published_at
        FROM music_moments m
        WHERE m.planet_id = p.id AND m.track_id = c.id
          AND m.visibility = 'public' AND m.published_at IS NOT NULL
        ORDER BY m.published_at DESC, m.created_at DESC, m.id DESC
        LIMIT 1
      ) AS latest_public_moment_at,
      (
        SELECT m.content_text
        FROM music_moments m
        WHERE m.planet_id = p.id AND m.track_id = c.id
          AND m.visibility = 'public' AND m.published_at IS NOT NULL
        ORDER BY m.published_at DESC, m.created_at DESC, m.id DESC
        LIMIT 1
      ) AS latest_public_moment_text
    FROM music_planets p
    JOIN music_track_catalog c ON c.id = ?1 AND c.is_active = 1
    WHERE p.visibility = 'public'
      AND p.owner_user_id <> ?2
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?2 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?2)
      )
      AND (
        EXISTS (
          SELECT 1 FROM music_planet_tracks t
          WHERE t.planet_id = p.id AND t.track_id = c.id
        )
        OR EXISTS (
          SELECT 1 FROM music_moments m
          WHERE m.planet_id = p.id AND m.track_id = c.id
            AND m.visibility = 'public' AND m.published_at IS NOT NULL
        )
      )
    ORDER BY MAX(COALESCE(latest_public_moment_at, ''), COALESCE(selected_at, '')) DESC, p.id ASC
    LIMIT 100
  `).bind(trackId, viewerUserId).all<PortalMatchRow>()
  return results
}

async function recordTaskFailure(env: Env, taskId: string, errorCode: string, latencyMs: number) {
  await env.DB.prepare(`
    UPDATE music_ai_tasks
    SET status = 'failed', error_code = ?2, latency_ms = ?3, updated_at = ?4
    WHERE id = ?1
  `).bind(taskId, errorCode, Math.max(0, Math.round(latencyMs)), new Date().toISOString()).run()
}

async function recordInputChanged(env: Env, taskId: string, latencyMs: number) {
  await recordTaskFailure(env, taskId, 'AI_INPUT_CHANGED', latencyMs)
}

async function rankCandidates(
  env: Env,
  userId: string,
  planetId: string,
  track: TrackRow,
  candidates: PortalMatchRow[],
): Promise<RankingOutcome> {
  const endpoint = gatewayUrl(env.MUSIC_AI_SONG_PORTAL_URL)
  const clientId = env.MUSIC_AI_ACCESS_CLIENT_ID?.trim()
  const clientSecret = env.MUSIC_AI_ACCESS_CLIENT_SECRET?.trim()
  const gatewayToken = env.MUSIC_AI_GATEWAY_TOKEN?.trim()
  if (!endpoint || !clientId || !clientSecret || !gatewayToken) {
    return { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null, ranking: null }
  }
  if (!candidates.length) {
    return { mode: 'stable_fallback', status: 'no_candidates', model: null, taskId: null, ranking: null }
  }

  const input = rankInput(track, candidates)
  const inputHash = await hashInput(input)
  const taskId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version,
       schema_version, input_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'song_portal_rank', 'queued', 'local-gateway', 'pending', ?4, ?5, ?6, ?6)
  `).bind(taskId, userId, planetId, RANK_SCHEMA_VERSION, inputHash, createdAt).run()
  await env.DB.prepare(`
    UPDATE music_ai_tasks SET status = 'running', updated_at = ?2 WHERE id = ?1 AND status = 'queued'
  `).bind(taskId, new Date().toISOString()).run()

  const startedAt = Date.now()
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'Cf-Access-Client-Id': clientId,
        'Cf-Access-Client-Secret': clientSecret,
        authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ taskId, ...input }),
      redirect: 'error',
      signal: AbortSignal.timeout(RANK_TIMEOUT_MS),
    })
    if (!response.ok) {
      const latency = Date.now() - startedAt
      await recordTaskFailure(env, taskId, 'AI_GATEWAY_UNAVAILABLE', latency)
      return { mode: 'stable_fallback', status: 'gateway_unavailable', model: null, taskId, ranking: null }
    }

    const raw = await response.text()
    let result: ModelRank | null = null
    if (raw.length <= MAX_GATEWAY_RESPONSE_CHARS) {
      try {
        result = validateModelRank(JSON.parse(raw), candidates)
      } catch {
        result = null
      }
    }
    const latency = Date.now() - startedAt
    if (!result) {
      await recordTaskFailure(env, taskId, 'AI_RESULT_INVALID', latency)
      return { mode: 'stable_fallback', status: 'invalid_output', model: null, taskId, ranking: null }
    }

    const completedAt = new Date().toISOString()
    await env.DB.prepare(`
      UPDATE music_ai_tasks
      SET status = 'succeeded', model_name = ?2, model_version = ?3, result_json = ?4,
          latency_ms = ?5, error_code = NULL, updated_at = ?6
      WHERE id = ?1 AND status = 'running'
    `).bind(
      taskId,
      result.model.name,
      result.model.version,
      JSON.stringify({ ranking: result.ranking }),
      Math.max(0, Math.round(latency)),
      completedAt,
    ).run()
    return { mode: 'model', status: 'ready', model: result.model, taskId, ranking: result.ranking }
  } catch {
    const latency = Date.now() - startedAt
    await recordTaskFailure(env, taskId, 'AI_GATEWAY_UNAVAILABLE', latency)
    return { mode: 'stable_fallback', status: 'gateway_unavailable', model: null, taskId, ranking: null }
  }
}

function responseMatches(rows: PortalMatchRow[], ranking: RankingOutcome) {
  const scoreByPlanet = new Map(ranking.ranking?.map((item) => [item.planetId, item]) ?? [])
  const orderedRows = ranking.ranking
    ? ranking.ranking.flatMap((item) => {
        const row = rows.find((candidate) => candidate.planet_id === item.planetId)
        return row ? [row] : []
      })
    : rows

  return orderedRows.map((row) => {
    const score = scoreByPlanet.get(row.planet_id)
    return {
      ...publicMatch(row),
      rankScore: score?.score ?? null,
      reasonCode: score?.reasonCode ?? fallbackReason(matchSource(row)),
    }
  })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const trackId = new URL(request.url).searchParams.get('trackId')?.trim() ?? ''
  if (!trackId || trackId.length > 128) return respond({ error: 'INVALID_TRACK_ID' }, 400)

  const track = await env.DB.prepare(`
    SELECT id, title, artist_name, version_label, genres_json, mood_tags_json
    FROM music_track_catalog WHERE id = ?1 AND is_active = 1
  `).bind(trackId).first<TrackRow>()
  if (!track) return respond({ error: 'TRACK_NOT_AVAILABLE' }, 404)

  const ownEvidence = await env.DB.prepare(`
    SELECT p.id AS planet_id
    FROM music_planets p
    WHERE p.owner_user_id = ?1
      AND (
        EXISTS (
          SELECT 1 FROM music_planet_tracks t
          WHERE t.planet_id = p.id AND t.track_id = ?2
        )
        OR EXISTS (
          SELECT 1 FROM music_moments m
          WHERE m.planet_id = p.id AND m.track_id = ?2
            AND m.visibility = 'public' AND m.published_at IS NOT NULL
        )
      )
    LIMIT 1
  `).bind(identity.userId, trackId).first<{ planet_id: string }>()
  if (!ownEvidence) return respond({ error: 'TRACK_NOT_IN_ACTIVE_SELECTION_OR_PUBLIC_MOMENT' }, 403)

  const initialCandidates = await readCandidates(env, trackId, identity.userId)
  const ranking = await rankCandidates(env, identity.userId, ownEvidence.planet_id, track, initialCandidates)
  let finalCandidates = initialCandidates
  let finalRanking = ranking

  // Model inference can take several seconds. Re-read public eligibility before
  // returning so a planet made private while the model runs cannot leak from
  // the earlier snapshot.
  if (ranking.taskId) {
    finalCandidates = await readCandidates(env, trackId, identity.userId)
    const initialHash = await hashInput(rankInput(track, initialCandidates))
    const finalHash = await hashInput(rankInput(track, finalCandidates))
    if (initialHash !== finalHash) {
      await recordInputChanged(env, ranking.taskId, 0)
      finalRanking = {
        mode: 'stable_fallback', status: 'input_changed', model: null, taskId: ranking.taskId, ranking: null,
      }
    }
  }

  return respond({
    trackId,
    ranking: {
      mode: finalRanking.mode,
      status: finalRanking.status,
      model: finalRanking.model,
      taskId: finalRanking.taskId,
    },
    matches: responseMatches(finalCandidates, finalRanking),
  })
}
