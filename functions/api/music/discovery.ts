import { authenticatedMusicUser, type Env } from '../../_shared'
import { stringArray } from '../../_music-moments'

const SCHEMA_VERSION = 1
const MODEL_ID = 'qwen3-embedding:0.6b'
const GATEWAY_TIMEOUT_MS = 8_000
const MAX_EMBEDDING_INPUTS = 81
const MAX_DISCOVERY_CANDIDATES = MAX_EMBEDDING_INPUTS - 1
const MAX_TEXT_CHARS = 1_200
const RECOMMENDATION_LIMIT = 6

type SignalRow = {
  planet_id: string
  display_name: string
  tagline: string
  title: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  moment_text: string | null
}

type PlanetFeatures = {
  planetId: string
  displayName: string
  tagline: string
  genres: Set<string>
  genreLabels: Map<string, string>
  moods: Set<string>
  moments: string[]
  songs: Set<string>
}

type ReasonCode = 'similar_genre' | 'similar_mood' | 'similar_moment' | 'semantic_profile' | 'random'

type DiscoveryCandidate = {
  planetId: string
  displayName: string
  tagline: string
  reasonCode: ReasonCode
  matchScore: number
  rankScore: number
}

type DiscoveryInput = {
  schemaVersion: number
  model: string
  inputs: Array<{ id: string; text: string }>
}

type ModelEmbeddings = {
  model: { name: string; version: string }
  vectors: Map<string, number[]>
}

type EmbeddingOutcome = {
  mode: 'model' | 'stable_fallback'
  status: 'ready' | 'not_configured' | 'no_candidates' | 'no_query_signals' | 'gateway_unavailable' | 'invalid_output' | 'input_changed'
  model: { name: string; version: string } | null
  taskId: string | null
  scores: Map<string, number> | null
}

export type DiscoveryResponse = {
  ranking: {
    mode: 'model' | 'stable_fallback'
    status: EmbeddingOutcome['status']
    model: { name: string; version: string } | null
    taskId: string | null
  }
  recommendations: Array<Omit<DiscoveryCandidate, 'rankScore'>>
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function normalizedTags(value: string) {
  return stringArray(value)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function readSignals(env: Env, userId: string, own: boolean): Promise<SignalRow[]> {
  const visibilityFilter = own ? '' : "AND p.visibility = 'public'"
  const ownerFilter = own ? 'AND p.owner_user_id = ?1' : 'AND p.owner_user_id <> ?1'
  const blockFilter = own ? '' : `AND NOT EXISTS (
    SELECT 1 FROM music_user_blocks b
    WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
       OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
  )`
  const { results } = await env.DB.prepare(`
    SELECT p.id AS planet_id, p.display_name, p.tagline,
           c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
           '' AS moment_text
    FROM music_planets p
    JOIN music_planet_tracks t ON t.planet_id = p.id
    JOIN music_track_catalog c ON c.id = t.track_id AND c.is_active = 1
    WHERE 1 = 1 ${visibilityFilter} ${ownerFilter} ${blockFilter}
    UNION ALL
    SELECT p.id AS planet_id, p.display_name, p.tagline,
           c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
           m.content_text AS moment_text
    FROM music_moments m
    JOIN music_planets p ON p.id = m.planet_id
    JOIN music_track_catalog c ON c.id = m.track_id AND c.is_active = 1
    WHERE m.visibility = 'public' AND m.published_at IS NOT NULL
      ${visibilityFilter} ${ownerFilter} ${blockFilter}
    LIMIT 4000
  `).bind(userId).all<SignalRow>()
  return results
}

function collectFeatures(rows: SignalRow[], own = false): Map<string, PlanetFeatures> {
  const features = new Map<string, PlanetFeatures>()
  for (const row of rows) {
    let item = features.get(row.planet_id)
    if (!item) {
      item = {
        planetId: row.planet_id,
        displayName: own ? '' : row.display_name,
        tagline: own ? '' : row.tagline,
        genres: new Set(),
        genreLabels: new Map(),
        moods: new Set(),
        moments: [],
        songs: new Set(),
      }
      features.set(row.planet_id, item)
    }
    item.songs.add(`${row.title} ${row.artist_name} ${row.version_label}`.trim())
    for (const label of normalizedTags(row.genres_json)) {
      const key = label.toLocaleLowerCase()
      item.genres.add(key)
      item.genreLabels.set(key, label)
    }
    for (const label of normalizedTags(row.mood_tags_json)) item.moods.add(label.toLocaleLowerCase())
    const moment = row.moment_text?.trim()
    if (moment) item.moments.push(Array.from(moment).slice(0, 400).join(''))
  }
  return features
}

function signalsSignature(rows: SignalRow[]) {
  return rows
    .map((row) => JSON.stringify([
      row.planet_id,
      row.display_name,
      row.tagline,
      row.title,
      row.artist_name,
      row.version_label,
      row.genres_json,
      row.mood_tags_json,
      row.moment_text,
    ]))
    .sort()
    .join('\n')
}

function sampleCandidates(features: Map<string, PlanetFeatures>, viewer: PlanetFeatures | undefined) {
  const entries = [...features.entries()]
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = entries[index]
    entries[index] = entries[swapIndex]
    entries[swapIndex] = current
  }
  if (entries.length <= MAX_DISCOVERY_CANDIDATES) return new Map(entries)

  const ranked = entries
    .map(([id, candidate]) => ({ entry: [id, candidate] as const, score: fallbackRelevance(viewer, candidate).score }))
    .sort((left, right) => right.score - left.score)
  const relevancePoolSize = Math.floor(MAX_DISCOVERY_CANDIDATES * .6)
  const relevancePool = ranked.slice(0, relevancePoolSize).map(({ entry }) => entry)
  const explorationPool = ranked.slice(relevancePoolSize).map(({ entry }) => entry)
  for (let index = explorationPool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = explorationPool[index]
    explorationPool[index] = explorationPool[swapIndex]
    explorationPool[swapIndex] = current
  }
  return new Map([...relevancePool, ...explorationPool.slice(0, MAX_DISCOVERY_CANDIDATES - relevancePool.length)])
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function textTokens(value: string) {
  const tokens = new Set<string>()
  const normalized = value.toLocaleLowerCase()
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) if (token.length > 1) tokens.add(token)
  for (const sequence of normalized.match(/[\u3400-\u9fff]+/g) ?? []) {
    const chars = Array.from(sequence)
    if (chars.length === 1) tokens.add(chars[0])
    for (let index = 0; index < chars.length - 1; index += 1) tokens.add(chars[index] + chars[index + 1])
  }
  return tokens
}

function momentSimilarity(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0
  let highest = 0
  for (const a of left) for (const b of right) highest = Math.max(highest, jaccard(textTokens(a), textTokens(b)))
  return highest
}

function fallbackRelevance(viewer: PlanetFeatures | undefined, candidate: PlanetFeatures) {
  if (!viewer) return { score: 0, reasonCode: 'random' as const }
  const genre = jaccard(viewer.genres, candidate.genres)
  const mood = jaccard(viewer.moods, candidate.moods)
  const moment = momentSimilarity(viewer.moments, candidate.moments)
  const dimensions = [
    ...(viewer.genres.size && candidate.genres.size ? [genre * .42] : []),
    ...(viewer.moods.size && candidate.moods.size ? [mood * .24] : []),
    ...(viewer.moments.length && candidate.moments.length ? [moment * .34] : []),
  ]
  const denominator = (viewer.genres.size && candidate.genres.size ? .42 : 0)
    + (viewer.moods.size && candidate.moods.size ? .24 : 0)
    + (viewer.moments.length && candidate.moments.length ? .34 : 0)
  const score = denominator ? dimensions.reduce((sum, value) => sum + value, 0) / denominator : 0
  if (moment >= .12 && moment >= genre && moment >= mood) return { score, reasonCode: 'similar_moment' as const }
  if (genre > 0) return { score, reasonCode: 'similar_genre' as const }
  if (mood > 0) return { score, reasonCode: 'similar_mood' as const }
  if (moment > 0) return { score, reasonCode: 'similar_moment' as const }
  return { score, reasonCode: 'random' as const }
}

function featureText(features: PlanetFeatures) {
  const genres = [...features.genreLabels.values()].slice(0, 16)
  const moods = [...features.moods].slice(0, 16)
  const songs = [...features.songs].slice(0, 12)
  return [
    genres.length ? `曲风：${genres.join('、')}` : '',
    moods.length ? `情绪标签：${moods.join('、')}` : '',
    songs.length ? `主动选歌：${songs.join('；')}` : '',
    features.moments.length ? `公开 Moment：${features.moments.slice(0, 5).join('；')}` : '',
  ].filter(Boolean).join('\n').slice(0, MAX_TEXT_CHARS)
}

async function inputHash(input: DiscoveryInput) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function endpointUrl(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function parseEmbeddings(value: unknown, expectedIds: string[]): ModelEmbeddings | null {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'embeddings,model' || !isRecord(value.model)) return null
  if (Object.keys(value.model).sort().join(',') !== 'name,version' || !Array.isArray(value.embeddings)) return null
  const name = typeof value.model.name === 'string' ? value.model.name.trim() : ''
  const version = typeof value.model.version === 'string' ? value.model.version.trim() : ''
  if (!name || name.length > 80 || !version || version.length > 80 || value.embeddings.length !== expectedIds.length) return null

  const vectors = new Map<string, number[]>()
  let dimension = 0
  for (const raw of value.embeddings) {
    if (!isRecord(raw) || Object.keys(raw).sort().join(',') !== 'id,vector') return null
    if (typeof raw.id !== 'string' || !expectedIds.includes(raw.id) || vectors.has(raw.id) || !Array.isArray(raw.vector)) return null
    if (raw.vector.length < 8 || raw.vector.length > 4096 || (dimension && raw.vector.length !== dimension)) return null
    if (!raw.vector.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null
    const vector = raw.vector as number[]
    if (vector.every((entry) => entry === 0)) return null
    dimension = vector.length
    vectors.set(raw.id, vector)
  }
  if (vectors.size !== expectedIds.length) return null
  return { model: { name, version }, vectors }
}

function cosine(left: number[], right: number[]) {
  if (left.length !== right.length) return null
  let dot = 0
  let normLeft = 0
  let normRight = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    normLeft += left[index] * left[index]
    normRight += right[index] * right[index]
  }
  if (!normLeft || !normRight) return null
  return Math.max(0, Math.min(1, dot / Math.sqrt(normLeft * normRight)))
}

async function recordTaskResult(env: Env, taskId: string, model: { name: string; version: string }, scores: Map<string, number>, latencyMs: number) {
  const result = JSON.stringify([...scores.entries()].map(([planetId, score]) => ({ planetId, score })))
  await env.DB.prepare(`
    UPDATE music_ai_tasks
    SET status = 'succeeded', model_name = ?2, model_version = ?3,
        result_json = ?4, latency_ms = ?5, updated_at = ?6
    WHERE id = ?1
  `).bind(taskId, model.name, model.version, result, Math.max(0, Math.round(latencyMs)), new Date().toISOString()).run()
}

async function recordTaskFailure(env: Env, taskId: string, errorCode: string, latencyMs: number) {
  await env.DB.prepare(`
    UPDATE music_ai_tasks
    SET status = 'failed', error_code = ?2, result_json = NULL, latency_ms = ?3, updated_at = ?4
    WHERE id = ?1
  `).bind(taskId, errorCode, Math.max(0, Math.round(latencyMs)), new Date().toISOString()).run()
}

async function embedAndScore(env: Env, userId: string, viewer: PlanetFeatures | undefined, candidates: Map<string, PlanetFeatures>): Promise<EmbeddingOutcome> {
  const endpoint = endpointUrl(env.MUSIC_AI_EMBEDDING_URL)
  const clientId = env.MUSIC_AI_ACCESS_CLIENT_ID?.trim()
  const clientSecret = env.MUSIC_AI_ACCESS_CLIENT_SECRET?.trim()
  const gatewayToken = env.MUSIC_AI_GATEWAY_TOKEN?.trim()
  if (!endpoint || !clientId || !clientSecret || !gatewayToken) return { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null, scores: null }
  if (!candidates.size) return { mode: 'stable_fallback', status: 'no_candidates', model: null, taskId: null, scores: null }
  if (!viewer || !featureText(viewer).trim()) return { mode: 'stable_fallback', status: 'no_query_signals', model: null, taskId: null, scores: null }

  const modelCandidates = new Map([...candidates.entries()].slice(0, MAX_EMBEDDING_INPUTS - 1))

  const input: DiscoveryInput = {
    schemaVersion: SCHEMA_VERSION,
    model: MODEL_ID,
    inputs: [
      { id: 'query', text: featureText(viewer) },
      ...[...modelCandidates.values()].map((candidate) => ({ id: `planet:${candidate.planetId}`, text: featureText(candidate) })),
    ],
  }
  if (input.inputs.length > MAX_EMBEDDING_INPUTS) input.inputs = input.inputs.slice(0, MAX_EMBEDDING_INPUTS)
  const hash = await inputHash(input)
  const taskId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version,
       schema_version, input_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'discovery_embedding', 'queued', 'qwen3-embedding-local', 'pending', ?4, ?5, ?6, ?6)
  `).bind(taskId, userId, viewer?.planetId ?? null, SCHEMA_VERSION, hash, createdAt).run()
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
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })
    if (!response.ok) {
      const latency = Date.now() - startedAt
      await recordTaskFailure(env, taskId, 'AI_GATEWAY_UNAVAILABLE', latency)
      return { mode: 'stable_fallback', status: 'gateway_unavailable', model: null, taskId, scores: null }
    }
    const raw: unknown = await response.json()
    const parsed = parseEmbeddings(raw, input.inputs.map((item) => item.id))
    if (!parsed) {
      const latency = Date.now() - startedAt
      await recordTaskFailure(env, taskId, 'AI_INVALID_OUTPUT', latency)
      return { mode: 'stable_fallback', status: 'invalid_output', model: null, taskId, scores: null }
    }
    const query = parsed.vectors.get('query')!
    const scores = new Map<string, number>()
    for (const candidate of modelCandidates.values()) {
      const vector = parsed.vectors.get(`planet:${candidate.planetId}`)
      if (!vector) continue
      const score = cosine(query, vector)
      if (score !== null) scores.set(candidate.planetId, score)
    }
    if (scores.size !== modelCandidates.size) {
      const latency = Date.now() - startedAt
      await recordTaskFailure(env, taskId, 'AI_INVALID_OUTPUT', latency)
      return { mode: 'stable_fallback', status: 'invalid_output', model: null, taskId, scores: null }
    }
    const latency = Date.now() - startedAt
    await recordTaskResult(env, taskId, parsed.model, scores, latency)
    return { mode: 'model', status: 'ready', model: parsed.model, taskId, scores }
  } catch {
    const latency = Date.now() - startedAt
    await recordTaskFailure(env, taskId, 'AI_GATEWAY_UNAVAILABLE', latency)
    return { mode: 'stable_fallback', status: 'gateway_unavailable', model: null, taskId, scores: null }
  }
}

async function readVisitedPlanetIds(env: Env, userId: string) {
  const { results } = await env.DB.prepare(`
    SELECT planet_id FROM music_planet_visits WHERE visitor_user_id = ?1
  `).bind(userId).all<{ planet_id: string }>()
  return new Set(results.map(({ planet_id }) => planet_id))
}

function rankRecommendations(
  viewer: PlanetFeatures | undefined,
  candidates: Map<string, PlanetFeatures>,
  outcome: EmbeddingOutcome,
  visitedPlanetIds: Set<string>,
  preferUnvisited: boolean,
): DiscoveryCandidate[] {
  return [...candidates.values()].map((candidate) => {
    const fallback = fallbackRelevance(viewer, candidate)
    const matchScore = outcome.scores?.get(candidate.planetId) ?? fallback.score
    const reasonCode = fallback.reasonCode
    return {
      planetId: candidate.planetId,
      displayName: candidate.displayName,
      tagline: candidate.tagline,
      reasonCode: outcome.scores ? 'semantic_profile' : reasonCode,
      matchScore: Math.round(matchScore * 1000) / 1000,
      rankScore: matchScore * .78 + Math.random() * .22
        + (preferUnvisited && !visitedPlanetIds.has(candidate.planetId) ? 2 : 0),
    }
  }).sort((left, right) => right.rankScore - left.rankScore || left.planetId.localeCompare(right.planetId))
    .slice(0, RECOMMENDATION_LIMIT)
}

export async function discoverPublicPlanets(env: Env, userId: string, preferUnvisited = false): Promise<DiscoveryResponse> {
  const [viewerRows, candidateRows] = await Promise.all([
    readSignals(env, userId, true),
    readSignals(env, userId, false),
  ])
  let viewerSnapshot = viewerRows
  let candidateSnapshot = candidateRows
  let viewerFeatures = [...collectFeatures(viewerSnapshot, true).values()][0]
  let candidates = sampleCandidates(collectFeatures(candidateSnapshot), viewerFeatures)
  if (!candidates.size) {
    return {
      ranking: { mode: 'stable_fallback', status: 'no_candidates', model: null, taskId: null },
      recommendations: [],
    }
  }

  let visitedPlanetIds = preferUnvisited ? await readVisitedPlanetIds(env, userId) : new Set<string>()
  let outcome = await embedAndScore(env, userId, viewerFeatures, candidates)

  // Embedding may take several seconds. Re-check visibility and source content
  // before returning any candidate so a planet made private during inference
  // cannot leak through a stale recommendation snapshot.
  const [freshViewerRows, freshCandidateRows, freshVisitedPlanetIds] = await Promise.all([
    readSignals(env, userId, true),
    readSignals(env, userId, false),
    preferUnvisited ? readVisitedPlanetIds(env, userId) : Promise.resolve(visitedPlanetIds),
  ])
  if (signalsSignature(viewerSnapshot) !== signalsSignature(freshViewerRows)
    || signalsSignature(candidateSnapshot) !== signalsSignature(freshCandidateRows)
    || (preferUnvisited && [...visitedPlanetIds].sort().join('\n') !== [...freshVisitedPlanetIds].sort().join('\n'))) {
    if (outcome.taskId) await recordTaskFailure(env, outcome.taskId, 'AI_INPUT_CHANGED', 0)
    viewerSnapshot = freshViewerRows
    candidateSnapshot = freshCandidateRows
    viewerFeatures = [...collectFeatures(viewerSnapshot, true).values()][0]
    visitedPlanetIds = freshVisitedPlanetIds
    candidates = sampleCandidates(collectFeatures(candidateSnapshot), viewerFeatures)
    if (!candidates.size) {
      return {
        ranking: { mode: 'stable_fallback', status: 'no_candidates', model: null, taskId: outcome.taskId },
        recommendations: [],
      }
    }
    outcome = {
      mode: 'stable_fallback',
      status: 'input_changed',
      model: null,
      taskId: outcome.taskId,
      scores: null,
    }
  }

  const recommendations = rankRecommendations(viewerFeatures, candidates, outcome, visitedPlanetIds, preferUnvisited)
  return {
    ranking: { mode: outcome.mode, status: outcome.status, model: outcome.model, taskId: outcome.taskId },
    recommendations: recommendations.map(({ rankScore: _rankScore, ...recommendation }) => recommendation),
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)
  return respond(await discoverPublicPlanets(env, identity.userId))
}
