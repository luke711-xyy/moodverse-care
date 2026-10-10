import { pairIsBlocked, isSocialRecord, socialResponse } from './_music-social'
import { safeHttpsUrl, type Env } from './_shared'
import { isManagedMomentPhoto } from '../src/music/moment-photo'
import { catalogTrack, CATALOG_VISUAL_COLUMNS, type CatalogTrackRow } from './_music-dither'

const MAX_BOTTLE_TEXT = 500
const MAX_BOTTLE_COMMENTS_PER_MINUTE = 30
const MAX_MODEL_CANDIDATES = 80
const MODEL_ID = 'qwen3-embedding:0.6b'
const MODEL_TIMEOUT_MS = 8_000
const DAY_MS = 24 * 60 * 60 * 1000

type BottleTopic =
  | { type: 'song'; trackId: string }
  | { type: 'info'; title: string; url: string; summary: string }
  | { type: 'moment'; momentId: string }

type BottleInput = { topic: BottleTopic; messageText: string }
type BottleRow = {
  id: string
  sender_user_id: string
  topic_type: 'song' | 'info' | 'moment'
  track_id: string | null
  moment_id: string | null
  info_title: string | null
  info_url: string | null
  info_summary: string | null
  message_text: string
  status: 'active' | 'stopped' | 'unavailable'
  created_at: string
}
type SignalRow = {
  user_id: string
  title: string
  artist_name: string
  version_label: string
  genres_json: string
  mood_tags_json: string
  moment_text: string
}
type Candidate = {
  userId: string
  text: string
  genres: Set<string>
  moods: Set<string>
  moments: string[]
  songs: Set<string>
}
type DeliveryRow = {
  id: string
  bottle_id: string
  recipient_user_id: string
  hop: number
  status: 'unread' | 'read' | 'released' | 'expired'
  delivered_at: string
  expires_at: string
  opened_at: string | null
}

export const driftBottleResponse = socialResponse
export const isDriftBottleRecord = isSocialRecord

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function boundedText(value: unknown, max: number, allowEmpty = true) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  const length = Array.from(normalized).length
  return length <= max && (allowEmpty || length > 0) ? normalized : null
}

export function parseDriftBottleInput(value: unknown): BottleInput | null {
  if (!isSocialRecord(value) || !['topic', 'messageText'].every((key) => key in value)
    || Object.keys(value).some((key) => !['topic', 'messageText'].includes(key))) return null
  const messageText = boundedText(value.messageText, MAX_BOTTLE_TEXT)
  if (messageText === null || !isSocialRecord(value.topic) || typeof value.topic.type !== 'string') return null
  const topic = value.topic
  if (topic.type === 'song' && exactKeys(topic, ['type', 'trackId'])
    && typeof topic.trackId === 'string' && topic.trackId.trim() && topic.trackId.length <= 128) {
    return { topic: { type: 'song', trackId: topic.trackId.trim() }, messageText }
  }
  if (topic.type === 'info' && exactKeys(topic, ['type', 'title', 'url', 'summary'])) {
    const title = boundedText(topic.title, 160, false)
    const summary = boundedText(topic.summary, 800)
    const url = typeof topic.url === 'string' ? safeHttpsUrl(topic.url.trim()) : null
    if (title && summary !== null && url && url.length <= 2048) {
      return { topic: { type: 'info', title, url, summary }, messageText }
    }
  }
  if (topic.type === 'moment' && exactKeys(topic, ['type', 'momentId'])
    && typeof topic.momentId === 'string' && topic.momentId.trim() && topic.momentId.length <= 128) {
    return { topic: { type: 'moment', momentId: topic.momentId.trim() }, messageText }
  }
  return null
}

const utcDay = (now: Date) => now.toISOString().slice(0, 10)
const isoAfterOneHour = (now: Date) => new Date(now.getTime() + 60 * 60 * 1000).toISOString()

async function validateBottleTopic(env: Env, senderId: string, topic: BottleTopic) {
  if (topic.type === 'song') {
    const track = await env.DB.prepare(`SELECT id FROM music_track_catalog WHERE id = ?1 AND is_active = 1`)
      .bind(topic.trackId).first<{ id: string }>()
    return track ? { ok: true as const } : { ok: false as const, error: 'TRACK_NOT_AVAILABLE' }
  }
  if (topic.type === 'moment') {
    const moment = await env.DB.prepare(`
      SELECT m.id FROM music_moments m
      JOIN music_planets p ON p.id = m.planet_id AND p.owner_user_id = ?2 AND p.visibility = 'public'
      WHERE m.id = ?1 AND m.visibility = 'public' AND m.published_at IS NOT NULL
    `).bind(topic.momentId, senderId).first<{ id: string }>()
    return moment ? { ok: true as const } : { ok: false as const, error: 'MOMENT_NOT_SHAREABLE' }
  }
  return { ok: true as const }
}

async function loadBottle(env: Env, bottleId: string) {
  return env.DB.prepare(`
    SELECT id, sender_user_id, topic_type, track_id, moment_id, info_title, info_url,
           info_summary, message_text, status, created_at
    FROM music_drift_bottles WHERE id = ?1
  `).bind(bottleId).first<BottleRow>()
}

async function contentIsAvailable(env: Env, bottle: BottleRow) {
  if (bottle.status !== 'active') return false
  if (bottle.topic_type === 'song') {
    const row = bottle.track_id
      ? await env.DB.prepare(`SELECT id FROM music_track_catalog WHERE id = ?1 AND is_active = 1`).bind(bottle.track_id).first()
      : null
    return Boolean(row)
  }
  if (bottle.topic_type === 'moment') {
    if (!bottle.moment_id) return false
    const row = await env.DB.prepare(`
      SELECT m.id FROM music_moments m JOIN music_planets p ON p.id = m.planet_id AND p.visibility = 'public'
      WHERE m.id = ?1 AND p.owner_user_id = ?2 AND m.visibility = 'public' AND m.published_at IS NOT NULL
    `).bind(bottle.moment_id, bottle.sender_user_id).first()
    return Boolean(row)
  }
  return Boolean(bottle.info_title && safeHttpsUrl(bottle.info_url))
}

async function stopUnavailableBottle(env: Env, bottleId: string, now: Date) {
  const timestamp = now.toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE music_drift_bottles SET status = 'unavailable', updated_at = ?2 WHERE id = ?1 AND status = 'active'`).bind(bottleId, timestamp),
    env.DB.prepare(`UPDATE music_drift_deliveries SET status = 'expired' WHERE bottle_id = ?1 AND status IN ('unread', 'read')`).bind(bottleId),
  ])
}

async function currentDelivery(env: Env, bottleId: string) {
  return env.DB.prepare(`
    SELECT id, bottle_id, recipient_user_id, hop, status, delivered_at, expires_at, opened_at
    FROM music_drift_deliveries WHERE bottle_id = ?1 AND status IN ('unread', 'read') LIMIT 1
  `).bind(bottleId).first<DeliveryRow>()
}

function parseJsonTags(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  } catch { return [] }
}

function buildBottleText(bottle: BottleRow, song?: { title: string; artist_name: string; version_label: string; genres_json: string; mood_tags_json: string }, momentText = '') {
  if (bottle.topic_type === 'info') return [`资讯：${bottle.info_title}`, bottle.info_summary ?? '', bottle.message_text].filter(Boolean).join('\n').slice(0, 1200)
  if (bottle.topic_type === 'moment') return [
    song ? `歌曲：${song.title} · ${song.artist_name} ${song.version_label}` : '',
    momentText,
    bottle.message_text,
  ].filter(Boolean).join('\n').slice(0, 1200)
  if (!song) return bottle.message_text.slice(0, 1200)
  return [
    `歌曲：${song.title} · ${song.artist_name} ${song.version_label}`,
    `曲风：${parseJsonTags(song.genres_json).slice(0, 12).join('、')}`,
    `情绪：${parseJsonTags(song.mood_tags_json).slice(0, 12).join('、')}`,
    bottle.message_text,
  ].filter(Boolean).join('\n').slice(0, 1200)
}

async function bottleModelText(env: Env, bottle: BottleRow) {
  if (bottle.topic_type === 'info') return buildBottleText(bottle)
  if (bottle.topic_type === 'moment') {
    const row = await env.DB.prepare(`
      SELECT c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json, m.content_text
      FROM music_moments m JOIN music_planets p ON p.id = m.planet_id AND p.visibility = 'public'
      JOIN music_track_catalog c ON c.id = m.track_id
      WHERE m.id = ?1 AND p.owner_user_id = ?2 AND m.visibility = 'public' AND m.published_at IS NOT NULL
    `).bind(bottle.moment_id, bottle.sender_user_id).first<{
      title: string; artist_name: string; version_label: string; genres_json: string; mood_tags_json: string; content_text: string
    }>()
    return buildBottleText(bottle, row ?? undefined, row?.content_text ?? '')
  }
  const row = await env.DB.prepare(`SELECT title, artist_name, version_label, genres_json, mood_tags_json FROM music_track_catalog WHERE id = ?1 AND is_active = 1`)
    .bind(bottle.track_id).first<{ title: string; artist_name: string; version_label: string; genres_json: string; mood_tags_json: string }>()
  return buildBottleText(bottle, row ?? undefined)
}

function candidateRowsSql(recentLimit: number) {
  return `
    WITH eligible AS (
      SELECT p.owner_user_id AS user_id, p.id AS planet_id
      FROM music_planets p
      WHERE p.visibility = 'public'
        AND p.owner_user_id <> ?1
        AND COALESCE((SELECT allow_receiving FROM music_drift_preferences WHERE user_id = p.owner_user_id), 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
             OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
        )
        AND NOT EXISTS (
          SELECT 1 FROM music_drift_deliveries recent
          WHERE recent.bottle_id = ?2 AND recent.recipient_user_id = p.owner_user_id
            AND recent.hop IN (SELECT h.hop FROM music_drift_deliveries h WHERE h.bottle_id = ?2 ORDER BY h.hop DESC LIMIT ${recentLimit})
        )
    )
    SELECT e.user_id, c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json, '' AS moment_text
    FROM eligible e
    JOIN music_planet_tracks pt ON pt.planet_id = e.planet_id
    JOIN music_track_catalog c ON c.id = pt.track_id AND c.is_active = 1
    UNION ALL
    SELECT e.user_id, c.title, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json, m.content_text AS moment_text
    FROM eligible e
    JOIN music_moments m ON m.planet_id = e.planet_id AND m.visibility = 'public' AND m.published_at IS NOT NULL
    JOIN music_track_catalog c ON c.id = m.track_id AND c.is_active = 1
    LIMIT 4000
  `
}

async function readCandidateSignals(env: Env, bottle: BottleRow, recentLimit: number) {
  const { results } = await env.DB.prepare(candidateRowsSql(recentLimit)).bind(bottle.sender_user_id, bottle.id).all<SignalRow>()
  const candidates = new Map<string, Candidate>()
  for (const row of results) {
    let candidate = candidates.get(row.user_id)
    if (!candidate) {
      candidate = { userId: row.user_id, text: '', genres: new Set(), moods: new Set(), moments: [], songs: new Set() }
      candidates.set(row.user_id, candidate)
    }
    candidate.songs.add(`${row.title} ${row.artist_name} ${row.version_label}`.trim())
    for (const genre of parseJsonTags(row.genres_json)) candidate.genres.add(genre.toLocaleLowerCase())
    for (const mood of parseJsonTags(row.mood_tags_json)) candidate.moods.add(mood.toLocaleLowerCase())
    if (row.moment_text.trim()) candidate.moments.push(Array.from(row.moment_text.trim()).slice(0, 300).join(''))
  }
  for (const candidate of candidates.values()) {
    candidate.text = [
      `歌曲：${[...candidate.songs].slice(0, 12).join('；')}`,
      `曲风：${[...candidate.genres].slice(0, 20).join('、')}`,
      `情绪：${[...candidate.moods].slice(0, 20).join('、')}`,
      `公开 Moment：${candidate.moments.slice(0, 5).join('；')}`,
    ].filter(Boolean).join('\n').slice(0, 1200)
  }
  return [...candidates.values()]
}

function shuffled<T>(values: T[]) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function tokenSet(value: string) {
  const tokens = new Set<string>()
  const normalized = value.toLocaleLowerCase()
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) if (token.length > 1) tokens.add(token)
  for (const sequence of normalized.match(/[㐀-鿿]+/g) ?? []) {
    const characters = Array.from(sequence)
    if (characters.length === 1) tokens.add(characters[0])
    for (let index = 0; index < characters.length - 1; index += 1) tokens.add(characters[index] + characters[index + 1])
  }
  return tokens
}

function lexicalScore(query: string, candidate: Candidate) {
  const queryTokens = tokenSet(query)
  const candidateTokens = tokenSet(candidate.text)
  if (!queryTokens.size || !candidateTokens.size) return 0
  let overlap = 0
  for (const token of queryTokens) if (candidateTokens.has(token)) overlap += 1
  return overlap / (queryTokens.size + candidateTokens.size - overlap)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function safeEmbeddingEndpoint(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.toString() : null
  } catch { return null }
}

function parseEmbeddingResponse(value: unknown, expectedIds: string[]) {
  if (!isSocialRecord(value) || Object.keys(value).sort().join(',') !== 'embeddings,model'
    || !isSocialRecord(value.model) || Object.keys(value.model).sort().join(',') !== 'name,version'
    || !Array.isArray(value.embeddings)) return null
  const modelName = typeof value.model.name === 'string' ? value.model.name.trim() : ''
  const modelVersion = typeof value.model.version === 'string' ? value.model.version.trim() : ''
  if (!modelName || modelName.length > 80 || !modelVersion || modelVersion.length > 80 || value.embeddings.length !== expectedIds.length) return null
  let dimension = 0
  const vectors = new Map<string, number[]>()
  for (const item of value.embeddings) {
    if (!isSocialRecord(item) || Object.keys(item).sort().join(',') !== 'id,vector'
      || typeof item.id !== 'string' || !expectedIds.includes(item.id) || vectors.has(item.id)
      || !Array.isArray(item.vector) || item.vector.length < 8 || item.vector.length > 4096) return null
    if (dimension && dimension !== item.vector.length) return null
    if (!item.vector.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null
    const vector = item.vector as number[]
    if (vector.every((entry) => entry === 0)) return null
    dimension = vector.length
    vectors.set(item.id, vector)
  }
  return vectors.size === expectedIds.length ? { model: { name: modelName, version: modelVersion }, vectors } : null
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) return null
  let dot = 0, leftNorm = 0, rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  return leftNorm && rightNorm ? Math.max(0, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm))) : null
}

async function modelScores(env: Env, bottle: BottleRow, candidates: Candidate[], queryText: string, now: Date) {
  const endpoint = safeEmbeddingEndpoint(env.MUSIC_AI_EMBEDDING_URL)
  const clientId = env.MUSIC_AI_ACCESS_CLIENT_ID?.trim()
  const clientSecret = env.MUSIC_AI_ACCESS_CLIENT_SECRET?.trim()
  const gatewayToken = env.MUSIC_AI_GATEWAY_TOKEN?.trim()
  if (!endpoint || !clientId || !clientSecret || !gatewayToken || !candidates.length) return null
  const sampled = shuffled(candidates).slice(0, MAX_MODEL_CANDIDATES)
  const inputs = [
    { id: 'bottle', text: queryText },
    ...sampled.map((candidate) => ({ id: `user:${candidate.userId}`, text: candidate.text })),
  ]
  const input = { schemaVersion: 1, model: MODEL_ID, inputs }
  const taskId = crypto.randomUUID()
  const createdAt = now.toISOString()
  const requesterPlanet = await env.DB.prepare(`SELECT id FROM music_planets WHERE owner_user_id = ?1`).bind(bottle.sender_user_id).first<{ id: string }>()
  await env.DB.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version, schema_version, input_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'bottle_embedding', 'queued', ?4, 'pending', 1, ?5, ?6, ?6)
  `).bind(taskId, bottle.sender_user_id, requesterPlanet?.id ?? null, MODEL_ID, await sha256(JSON.stringify(input)), createdAt).run()
  await env.DB.prepare(`UPDATE music_ai_tasks SET status = 'running', updated_at = ?2 WHERE id = ?1 AND status = 'queued'`)
    .bind(taskId, now.toISOString()).run()
  const startedAt = Date.now()
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'Cf-Access-Client-Id': clientId, 'Cf-Access-Client-Secret': clientSecret,
        authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify(input), redirect: 'error', signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error('AI_GATEWAY_UNAVAILABLE')
    const parsed = parseEmbeddingResponse(await response.json(), inputs.map(({ id }) => id))
    if (!parsed) throw new Error('AI_INVALID_OUTPUT')
    const queryVector = parsed.vectors.get('bottle')!
    const scores = new Map<string, number>()
    for (const candidate of sampled) {
      const vector = parsed.vectors.get(`user:${candidate.userId}`)
      const score = vector ? cosineSimilarity(queryVector, vector) : null
      if (score !== null) scores.set(candidate.userId, score)
    }
    if (scores.size !== sampled.length) throw new Error('AI_INVALID_OUTPUT')
    await env.DB.prepare(`
      UPDATE music_ai_tasks SET status = 'succeeded', model_name = ?2, model_version = ?3,
        result_json = ?4, latency_ms = ?5, updated_at = ?6 WHERE id = ?1
    `).bind(taskId, parsed.model.name, parsed.model.version, JSON.stringify([...scores.entries()].map(([userId, score]) => ({ userId, score }))),
      Math.max(0, Date.now() - startedAt), new Date().toISOString()).run()
    return scores
  } catch (error) {
    const errorCode = error instanceof Error && error.message === 'AI_INVALID_OUTPUT' ? 'AI_INVALID_OUTPUT' : 'AI_GATEWAY_UNAVAILABLE'
    await env.DB.prepare(`
      UPDATE music_ai_tasks SET status = 'failed', error_code = ?2, result_json = NULL, latency_ms = ?3, updated_at = ?4 WHERE id = ?1
    `).bind(taskId, errorCode, Math.max(0, Date.now() - startedAt), new Date().toISOString()).run()
    return null
  }
}

function rankedCandidates(candidates: Candidate[], queryText: string, scores: Map<string, number> | null) {
  return candidates.map((candidate) => ({
    candidate,
    score: scores?.get(candidate.userId) ?? lexicalScore(queryText, candidate),
    order: Math.random(),
  })).sort((left, right) => (right.score * .82 + right.order * .18) - (left.score * .82 + left.order * .18))
}

async function recipientStillEligible(env: Env, bottle: BottleRow, userId: string) {
  const row = await env.DB.prepare(`
    SELECT 1 AS ok FROM music_planets p
    WHERE p.owner_user_id = ?1 AND p.visibility = 'public'
      AND COALESCE((SELECT allow_receiving FROM music_drift_preferences WHERE user_id = ?1), 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id = ?2 AND b.blocked_user_id = ?1)
          OR (b.blocker_user_id = ?1 AND b.blocked_user_id = ?2)
      )
    LIMIT 1
  `).bind(userId, bottle.sender_user_id).first()
  return Boolean(row)
}

async function assignNextRecipient(env: Env, bottleId: string, now: Date) {
  const bottle = await loadBottle(env, bottleId)
  if (!bottle || bottle.status !== 'active') return 'unavailable' as const
  const existing = await currentDelivery(env, bottleId)
  if (existing) return existing.status === 'unread' ? 'delivered' as const : 'read' as const
  if (!(await contentIsAvailable(env, bottle))) {
    await stopUnavailableBottle(env, bottleId, now)
    return 'unavailable' as const
  }

  let candidates = await readCandidateSignals(env, bottle, 3)
  if (!candidates.length) candidates = await readCandidateSignals(env, bottle, 1)
  if (!candidates.length) return 'waiting' as const
  const queryText = await bottleModelText(env, bottle)
  const scores = await modelScores(env, bottle, candidates, queryText, now)
  const ranked = rankedCandidates(candidates, queryText, scores)
  const maxHop = await env.DB.prepare(`SELECT COALESCE(MAX(hop), 0) AS hop FROM music_drift_deliveries WHERE bottle_id = ?1`)
    .bind(bottleId).first<{ hop: number }>()
  const hop = (maxHop?.hop ?? 0) + 1
  const deliveredAt = now.toISOString()
  for (const { candidate } of ranked) {
    if (!(await recipientStillEligible(env, bottle, candidate.userId))) continue
    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO music_drift_deliveries
        (id, bottle_id, recipient_user_id, hop, status, delivered_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, 'unread', ?5, ?6
      WHERE EXISTS (SELECT 1 FROM music_drift_bottles WHERE id = ?2 AND status = 'active')
        AND NOT EXISTS (SELECT 1 FROM music_drift_deliveries WHERE bottle_id = ?2 AND status IN ('unread', 'read'))
        AND EXISTS (
          SELECT 1 FROM music_planets p
          WHERE p.owner_user_id = ?3 AND p.visibility = 'public'
            AND COALESCE((SELECT allow_receiving FROM music_drift_preferences WHERE user_id = ?3), 1) = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id = ?7 AND b.blocked_user_id = ?3)
            OR (b.blocker_user_id = ?3 AND b.blocked_user_id = ?7)
        )
    `).bind(crypto.randomUUID(), bottleId, candidate.userId, hop, deliveredAt, isoAfterOneHour(now), bottle.sender_user_id).run()
    if (inserted.meta.changes) return 'delivered' as const
    if (await currentDelivery(env, bottleId)) return 'delivered' as const
  }
  return 'waiting' as const
}

export async function createDriftBottle(env: Env, senderId: string, input: BottleInput, now = new Date()) {
  const validation = await validateBottleTopic(env, senderId, input.topic)
  if (!validation.ok) return { status: validation.error === 'TRACK_NOT_AVAILABLE' ? 404 : 400, body: { error: validation.error } }
  const id = crypto.randomUUID()
  const createdAt = now.toISOString()
  const day = utcDay(now)
  const topic = input.topic
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO music_drift_bottles
      (id, sender_user_id, topic_type, track_id, moment_id, info_title, info_url, info_summary,
       message_text, created_day_utc, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active', ?11, ?11)
  `).bind(id, senderId, topic.type,
    topic.type === 'song' ? topic.trackId : null,
    topic.type === 'moment' ? topic.momentId : null,
    topic.type === 'info' ? topic.title : null,
    topic.type === 'info' ? topic.url : null,
    topic.type === 'info' ? topic.summary : null,
    input.messageText, day, createdAt).run()
  if (!inserted.meta.changes) return { status: 409, body: { error: 'DAILY_BOTTLE_LIMIT' } }
  const deliveryState = await assignNextRecipient(env, id, now)
  return {
    status: 201,
    body: {
      sentToday: true,
      bottle: { id, status: deliveryState, topic: publicTopic(input.topic), createdAt },
    },
  }
}

function publicTopic(topic: BottleTopic) {
  if (topic.type === 'song') return { type: 'song', trackId: topic.trackId }
  if (topic.type === 'info') return { type: 'info', title: topic.title, url: topic.url }
  return { type: 'moment', momentId: topic.momentId }
}

export async function listDriftBottles(env: Env, userId: string, now = new Date()) {
  const [inbox, sent, preference] = await Promise.all([
    env.DB.prepare(`
      SELECT b.id, b.topic_type, b.info_title, c.title AS track_title,
             d.status AS delivery_status, d.delivered_at, d.expires_at
      FROM music_drift_deliveries d JOIN music_drift_bottles b ON b.id = d.bottle_id AND b.status = 'active'
      LEFT JOIN music_track_catalog c ON c.id = b.track_id
      WHERE d.recipient_user_id = ?1 AND d.status IN ('unread', 'read')
        AND (b.topic_type <> 'moment' OR EXISTS (
          SELECT 1 FROM music_moments m JOIN music_planets p ON p.id = m.planet_id
          WHERE m.id = b.moment_id AND p.owner_user_id = b.sender_user_id
            AND m.visibility = 'public' AND m.published_at IS NOT NULL
        ))
        AND NOT EXISTS (
          SELECT 1 FROM music_user_blocks bl WHERE (bl.blocker_user_id = ?1 AND bl.blocked_user_id = b.sender_user_id)
            OR (bl.blocker_user_id = b.sender_user_id AND bl.blocked_user_id = ?1)
        )
      ORDER BY d.delivered_at DESC, b.id ASC LIMIT 50
    `).bind(userId).all<{ id: string; topic_type: string; info_title: string | null; track_title: string | null; delivery_status: string; delivered_at: string; expires_at: string }>(),
    env.DB.prepare(`
      SELECT b.id, b.topic_type, b.info_title, c.title AS track_title, b.status, b.created_at,
             count(d.id) AS delivery_count,
             CASE WHEN b.status <> 'active' THEN b.status
                  WHEN current.status = 'unread' THEN 'delivered'
                  WHEN current.status = 'read' THEN 'waiting_for_release'
                  ELSE 'waiting' END AS delivery_state
      FROM music_drift_bottles b
      LEFT JOIN music_track_catalog c ON c.id = b.track_id
      LEFT JOIN music_drift_deliveries d ON d.bottle_id = b.id
      LEFT JOIN music_drift_deliveries current ON current.bottle_id = b.id AND current.status IN ('unread', 'read')
      WHERE b.sender_user_id = ?1
      GROUP BY b.id, b.topic_type, b.info_title, c.title, b.status, b.created_at, current.status
      ORDER BY b.created_at DESC, b.id ASC LIMIT 50
    `).bind(userId).all<{ id: string; topic_type: string; info_title: string | null; track_title: string | null; status: string; created_at: string; delivery_count: number; delivery_state: string }>(),
    env.DB.prepare(`SELECT allow_receiving FROM music_drift_preferences WHERE user_id = ?1`).bind(userId).first<{ allow_receiving: number }>(),
  ])
  const topicLabel = (type: string, title: string | null, trackTitle: string | null) =>
    type === 'song' ? `歌曲 · ${trackTitle ?? '歌曲资料暂不可用'}`
      : type === 'info' ? `资讯 · ${title ?? '资讯卡片'}` : 'Moment · 一段公开片刻'
  return {
    date: utcDay(now),
    allowReceiving: preference?.allow_receiving !== 0,
    inbox: inbox.results.map((row) => ({
      id: row.id, topicType: row.topic_type, topicLabel: topicLabel(row.topic_type, row.info_title, row.track_title),
      status: row.delivery_status, deliveredAt: row.delivered_at, expiresAt: row.expires_at,
    })),
    sentToday: Boolean(await env.DB.prepare(`SELECT 1 FROM music_drift_bottles WHERE sender_user_id = ?1 AND created_day_utc = ?2 LIMIT 1`)
      .bind(userId, utcDay(now)).first()),
    sent: sent.results.map((row) => ({
      id: row.id, topicType: row.topic_type, topicLabel: topicLabel(row.topic_type, row.info_title, row.track_title),
      status: row.delivery_state, deliveryCount: row.delivery_count, createdAt: row.created_at,
    })),
  }
}

async function activeDeliveryForRecipient(env: Env, bottleId: string, userId: string) {
  return env.DB.prepare(`
    SELECT d.id, d.bottle_id, d.recipient_user_id, d.hop, d.status, d.delivered_at, d.expires_at, d.opened_at
    FROM music_drift_deliveries d JOIN music_drift_bottles b ON b.id = d.bottle_id
    WHERE d.bottle_id = ?1 AND d.recipient_user_id = ?2 AND d.status IN ('unread', 'read') AND b.status = 'active'
    LIMIT 1
  `).bind(bottleId, userId).first<DeliveryRow>()
}

async function accessIsAllowed(env: Env, bottle: BottleRow, userId: string, delivery?: DeliveryRow | null) {
  if (!delivery || delivery.recipient_user_id !== userId) return false
  return !(await pairIsBlocked(env, bottle.sender_user_id, userId))
}

async function detailsForRecipient(env: Env, bottle: BottleRow, delivery: DeliveryRow, viewerId: string) {
  let topic: Record<string, unknown>
  if (bottle.topic_type === 'song') {
    const trackRow = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.id = ?1`)
      .bind(bottle.track_id).first<CatalogTrackRow>()
    topic = { type: 'song', track: trackRow ? catalogTrack(trackRow) : null }
  } else if (bottle.topic_type === 'info') {
    topic = { type: 'info', title: bottle.info_title, url: bottle.info_url, summary: bottle.info_summary }
  } else {
    const moment = await env.DB.prepare(`
      SELECT m.content_text, m.photo_url, ${CATALOG_VISUAL_COLUMNS}
      FROM music_moments m JOIN music_planets p ON p.id = m.planet_id JOIN music_track_catalog c ON c.id = m.track_id
      WHERE m.id = ?1 AND p.owner_user_id = ?2 AND m.visibility = 'public' AND m.published_at IS NOT NULL
    `).bind(bottle.moment_id, bottle.sender_user_id).first<CatalogTrackRow & { content_text: string; photo_url: string | null }>()
    topic = { type: 'moment', momentId: bottle.moment_id, contentText: moment?.content_text ?? '', photoUrl: isManagedMomentPhoto(moment?.photo_url) ? moment.photo_url : safeHttpsUrl(moment?.photo_url), track: moment ? catalogTrack(moment) : null }
  }
  const sender = await env.DB.prepare(`
    SELECT p.id AS planet_id, p.display_name, p.tagline FROM music_planets p
    WHERE p.owner_user_id = ?1 AND p.visibility = 'public'
      AND NOT EXISTS (SELECT 1 FROM music_user_blocks bl WHERE (bl.blocker_user_id = ?1 AND bl.blocked_user_id = ?2)
        OR (bl.blocker_user_id = ?2 AND bl.blocked_user_id = ?1))
    LIMIT 1
  `).bind(bottle.sender_user_id, viewerId).first<{ planet_id: string; display_name: string; tagline: string }>()
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.author_user_id, c.content_text, c.created_at,
           COALESCE(p.display_name, '星球访客') AS author_name,
           (SELECT count(*) FROM music_drift_comment_likes l WHERE l.comment_id = c.id) AS like_count,
           EXISTS (SELECT 1 FROM music_drift_comment_likes mine WHERE mine.comment_id = c.id AND mine.user_id = ?2) AS liked_by_me
    FROM music_drift_comments c
    LEFT JOIN music_planets p ON p.owner_user_id = c.author_user_id AND p.visibility = 'public'
    WHERE c.bottle_id = ?1
      AND NOT EXISTS (SELECT 1 FROM music_user_blocks bl WHERE (bl.blocker_user_id = c.author_user_id AND bl.blocked_user_id = ?2)
        OR (bl.blocker_user_id = ?2 AND bl.blocked_user_id = c.author_user_id))
    ORDER BY c.created_at ASC, c.id ASC LIMIT 200
  `).bind(bottle.id, viewerId).all<{ id: string; content_text: string; created_at: string; author_name: string; like_count: number; liked_by_me: number }>()
  return {
    bottle: {
      id: bottle.id, topic, messageText: bottle.message_text,
      sender: sender ? { planetId: sender.planet_id, displayName: sender.display_name, tagline: sender.tagline } : null,
    },
    delivery: { id: delivery.id, status: delivery.status, deliveredAt: delivery.delivered_at, expiresAt: delivery.expires_at, canRelease: delivery.status === 'read' },
    comments: results.map((row) => ({
      id: row.id, contentText: row.content_text, createdAt: row.created_at,
      authorName: row.author_user_id === viewerId ? '你' : row.author_name,
      isOwn: row.author_user_id === viewerId,
      likeCount: row.like_count, likedByMe: row.liked_by_me === 1,
    })),
  }
}

export async function getDriftBottleDetails(env: Env, bottleId: string, userId: string, now = new Date()) {
  const bottle = await loadBottle(env, bottleId)
  if (!bottle || bottle.status !== 'active') return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  const delivery = await activeDeliveryForRecipient(env, bottleId, userId)
  if (!delivery || !(await accessIsAllowed(env, bottle, userId, delivery))) return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  if (!(await contentIsAvailable(env, bottle))) {
    await stopUnavailableBottle(env, bottleId, now)
    return { status: 410, body: { error: 'BOTTLE_CONTENT_UNAVAILABLE' } }
  }
  if (delivery.status !== 'read') return { status: 409, body: { error: 'BOTTLE_NOT_OPENED' } }
  return { status: 200, body: await detailsForRecipient(env, bottle, delivery, userId) }
}

export async function openOrReleaseDriftBottle(env: Env, bottleId: string, userId: string, action: unknown, now = new Date()) {
  const bottle = await loadBottle(env, bottleId)
  if (!bottle || bottle.status !== 'active') return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  const delivery = await activeDeliveryForRecipient(env, bottleId, userId)
  if (!delivery || !(await accessIsAllowed(env, bottle, userId, delivery))) return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  if (!(await contentIsAvailable(env, bottle))) {
    await stopUnavailableBottle(env, bottleId, now)
    return { status: 410, body: { error: 'BOTTLE_CONTENT_UNAVAILABLE' } }
  }

  if (action === 'open') {
    if (delivery.status === 'read') return { status: 200, body: { delivery: { status: 'read' }, alreadyOpened: true } }
    if (delivery.expires_at <= now.toISOString()) return { status: 410, body: { error: 'BOTTLE_DELIVERY_EXPIRED' } }
    const openedAt = now.toISOString()
    const updated = await env.DB.prepare(`
      UPDATE music_drift_deliveries SET status = 'read', opened_at = ?3
      WHERE id = ?1 AND recipient_user_id = ?2 AND status = 'unread' AND expires_at > ?3
    `).bind(delivery.id, userId, openedAt).run()
    if (!updated.meta.changes) return { status: 409, body: { error: 'BOTTLE_DELIVERY_CHANGED' } }
    return { status: 200, body: { delivery: { status: 'read' }, alreadyOpened: false } }
  }

  if (action === 'release') {
    if (delivery.status !== 'read') return { status: 409, body: { error: 'BOTTLE_MUST_BE_OPENED' } }
    const releasedAt = now.toISOString()
    const updated = await env.DB.prepare(`
      UPDATE music_drift_deliveries SET status = 'released', released_at = ?3
      WHERE id = ?1 AND recipient_user_id = ?2 AND status = 'read'
    `).bind(delivery.id, userId, releasedAt).run()
    if (!updated.meta.changes) return { status: 409, body: { error: 'BOTTLE_DELIVERY_CHANGED' } }
    const deliveryState = await assignNextRecipient(env, bottleId, now)
    return { status: 200, body: { released: true, status: deliveryState } }
  }
  return { status: 400, body: { error: 'INVALID_BOTTLE_ACTION' } }
}

async function currentReadDelivery(env: Env, bottleId: string, userId: string) {
  const bottle = await loadBottle(env, bottleId)
  const delivery = await activeDeliveryForRecipient(env, bottleId, userId)
  if (!bottle || bottle.status !== 'active' || !delivery || delivery.status !== 'read'
    || !(await accessIsAllowed(env, bottle, userId, delivery)) || !(await contentIsAvailable(env, bottle))) return null
  return { bottle, delivery }
}

export async function addDriftBottleComment(env: Env, bottleId: string, userId: string, payload: unknown, now = new Date()) {
  if (!isSocialRecord(payload) || !exactKeys(payload, ['contentText'])) return { status: 400, body: { error: 'INVALID_BOTTLE_COMMENT' } }
  const contentText = boundedText(payload.contentText, MAX_BOTTLE_TEXT, false)
  if (!contentText) return { status: 400, body: { error: 'INVALID_BOTTLE_COMMENT' } }
  const current = await currentReadDelivery(env, bottleId, userId)
  if (!current) return { status: 409, body: { error: 'BOTTLE_MUST_BE_OPENED' } }
  const id = crypto.randomUUID()
  const createdAt = now.toISOString()
  const windowStart = new Date(now.getTime() - 60_000).toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO music_drift_comments (id, bottle_id, delivery_id, author_user_id, content_text, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6
    WHERE EXISTS (SELECT 1 FROM music_drift_deliveries WHERE id = ?3 AND status = 'read' AND recipient_user_id = ?4)
      AND (
        SELECT count(*) FROM music_drift_comments recent
        WHERE recent.author_user_id = ?4 AND recent.created_at >= ?7
      ) < ?8
  `).bind(id, bottleId, current.delivery.id, userId, contentText, createdAt, windowStart, MAX_BOTTLE_COMMENTS_PER_MINUTE).run()
  if (!result.meta.changes) {
    if (!await currentReadDelivery(env, bottleId, userId)) return { status: 409, body: { error: 'BOTTLE_DELIVERY_CHANGED' } }
    const recent = await env.DB.prepare(`
      SELECT count(*) AS count FROM music_drift_comments
      WHERE author_user_id = ?1 AND created_at >= ?2
    `).bind(userId, windowStart).first<{ count: number }>()
    return (recent?.count ?? 0) >= MAX_BOTTLE_COMMENTS_PER_MINUTE
      ? { status: 429, body: { error: 'COMMENT_RATE_LIMITED' } }
      : { status: 409, body: { error: 'BOTTLE_DELIVERY_CHANGED' } }
  }
  return { status: 201, body: { comment: { id, contentText, createdAt, authorName: '你', likeCount: 0, likedByMe: false } } }
}

export async function setDriftBottleCommentLike(env: Env, bottleId: string, commentId: string, userId: string, liked: boolean, now = new Date()) {
  const current = await currentReadDelivery(env, bottleId, userId)
  if (!current) return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  const comment = await env.DB.prepare(`SELECT id FROM music_drift_comments WHERE id = ?1 AND bottle_id = ?2`).bind(commentId, bottleId).first()
  if (!comment) return { status: 404, body: { error: 'BOTTLE_COMMENT_NOT_FOUND' } }
  if (liked) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO music_drift_comment_likes (comment_id, user_id, created_at)
      SELECT ?1, ?2, ?3 WHERE EXISTS (
        SELECT 1 FROM music_drift_deliveries WHERE id = ?4 AND status = 'read' AND recipient_user_id = ?2
      )
    `).bind(commentId, userId, now.toISOString(), current.delivery.id).run()
  } else {
    await env.DB.prepare(`DELETE FROM music_drift_comment_likes WHERE comment_id = ?1 AND user_id = ?2`).bind(commentId, userId).run()
  }
  const likeCount = await env.DB.prepare(`SELECT count(*) AS count FROM music_drift_comment_likes WHERE comment_id = ?1`)
    .bind(commentId).first<{ count: number }>()
  return { status: 200, body: { liked, likeCount: likeCount?.count ?? 0 } }
}

export async function deleteDriftBottleComment(env: Env, bottleId: string, commentId: string, userId: string) {
  const current = await currentReadDelivery(env, bottleId, userId)
  if (!current) return { status: 404, body: { error: 'BOTTLE_NOT_FOUND' } }
  const removed = await env.DB.prepare(`
    DELETE FROM music_drift_comments
    WHERE id = ?1 AND bottle_id = ?2 AND author_user_id = ?3
      AND EXISTS (SELECT 1 FROM music_drift_deliveries WHERE id = ?4 AND status = 'read' AND recipient_user_id = ?3)
  `).bind(commentId, bottleId, userId, current.delivery.id).run()
  return removed.meta.changes ? { status: 200, body: { ok: true } } : { status: 404, body: { error: 'BOTTLE_COMMENT_NOT_FOUND' } }
}

export async function processDriftBottleQueue(env: Env, now = new Date(), limit = 50) {
  const nowText = now.toISOString()
  const expired = await env.DB.prepare(`
    SELECT id, bottle_id FROM music_drift_deliveries
    WHERE status = 'unread' AND expires_at <= ?1 ORDER BY expires_at ASC, id ASC LIMIT ?2
  `).bind(nowText, limit).all<{ id: string; bottle_id: string }>()
  let expiredCount = 0
  for (const delivery of expired.results) {
    const updated = await env.DB.prepare(`UPDATE music_drift_deliveries SET status = 'expired' WHERE id = ?1 AND status = 'unread' AND expires_at <= ?2`)
      .bind(delivery.id, nowText).run()
    expiredCount += updated.meta.changes
  }
  const active = await env.DB.prepare(`
    SELECT b.id FROM music_drift_bottles b
    WHERE b.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM music_drift_deliveries d WHERE d.bottle_id = b.id AND d.status IN ('unread', 'read')
    )
    ORDER BY b.created_at ASC, b.id ASC LIMIT ?1
  `).bind(limit).all<{ id: string }>()
  let reassigned = 0
  for (const row of active.results) {
    const state = await assignNextRecipient(env, row.id, now)
    if (state === 'delivered') reassigned += 1
  }
  return { expired: expiredCount, reassigned, checked: active.results.length }
}

export function driftBottleStatusLabel(status: string) {
  if (status === 'unread') return '待打开'
  if (status === 'read') return '已打开 · 等待放流'
  if (status === 'waiting') return '等待合适的下一位'
  if (status === 'waiting_for_release') return '已读 · 正在等待放流'
  if (status === 'stopped') return '已停止传播'
  if (status === 'unavailable') return '内容已不可用'
  if (status === 'delivered') return '正在漂流'
  return status
}
