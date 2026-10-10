import { safeHttpsUrl, type Env } from './_shared'
import { catalogTrack, CATALOG_VISUAL_COLUMNS, type CatalogTrackRow } from './_music-dither'
import type { MusicTrackSummary } from '../src/music-domain'

const API = 'https://api.audius.co/v1'
const TTL = 10 * 60 * 1000
type AudiusRecord = Record<string, any>
const record = (v: unknown): v is AudiusRecord => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const identifier = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9]{1,64}$/.test(v) ? v : null

/** Only public, full-streamable tracks. Never turn a paid preview into a full song. */
export function audiusCatalogRow(value: unknown): CatalogTrackRow | null {
  if (!record(value) || !identifier(value.id) || !record(value.user) || !identifier(value.user.id)
    || typeof value.title !== 'string' || !value.title.trim() || typeof value.user.name !== 'string'
    || value.is_streamable === false || value.is_available === false || value.is_delete || value.is_unlisted
    || value.is_stream_gated || value.access === 'gated' || value.access === 'premium') return null
  const bpm = typeof value.bpm === 'number' && Number.isFinite(value.bpm) && value.bpm >= 30 && value.bpm <= 300 ? value.bpm : null
  const permalink = typeof value.permalink === 'string' && /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(value.permalink) ? value.permalink : null
  return { id: `audius:${value.id}`, title: value.title.trim().slice(0, 300), artist_id: `audius:${value.user.id}`,
    artist_name: value.user.name.trim().slice(0, 200), version_label: '', provider: 'audius',
    genres_json: JSON.stringify(typeof value.genre === 'string' ? [value.genre.slice(0, 100)] : []),
    mood_tags_json: JSON.stringify(typeof value.mood === 'string' ? [value.mood.slice(0, 100)] : []),
    official_url: permalink ? `https://audius.co${permalink}` : `https://audius.co/tracks/${value.id}`,
    cover_url: record(value.artwork) ? safeHttpsUrl(value.artwork['480x480'] ?? value.artwork['1000x1000'] ?? value.artwork['150x150']) : null,
    duration_seconds: typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0 ? Math.floor(value.duration) : null,
    // Tempo comes from Audius; other visual traits remain genre-derived, not invented measurements.
    visual_features_json: JSON.stringify({ source: 'audius', tempoBpm: bpm }),
  }
}

export async function audiusGet(env: Env, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('app_name', 'MOSIC')
  if (env.AUDIUS_API_KEY) url.searchParams.set('api_key', env.AUDIUS_API_KEY)
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('AUDIUS_UNAVAILABLE') // Never include upstream URLs/key in errors.
  const body: unknown = await response.json()
  if (!record(body)) throw new Error('AUDIUS_INVALID_RESPONSE')
  return body
}

export function audiusUpsert(env: Pick<Env, 'DB'>, row: CatalogTrackRow) {
  const timestamp = new Date().toISOString()
  return env.DB.prepare(`INSERT INTO music_track_catalog
    (id,title,artist_id,artist_name,version_label,genres_json,mood_tags_json,provider,provider_track_id,official_url,cover_url,duration_seconds,visual_features_json,is_active,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,'audius',?8,?9,?10,?11,?12,1,?13,?13)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist_id=excluded.artist_id,artist_name=excluded.artist_name,
      genres_json=excluded.genres_json,mood_tags_json=excluded.mood_tags_json,official_url=excluded.official_url,
      cover_url=excluded.cover_url,duration_seconds=excluded.duration_seconds,visual_features_json=excluded.visual_features_json,is_active=1,updated_at=excluded.updated_at`)
    .bind(row.id, row.title, row.artist_id, row.artist_name, row.version_label, row.genres_json, row.mood_tags_json,
      row.id.slice(7), row.official_url, row.cover_url, row.duration_seconds, row.visual_features_json ?? null, timestamp)
}

type CatalogPage = { tracks: MusicTrackSummary[]; status: 'live' | 'cached' | 'offline'; hasMore: boolean }
const pending = new Map<string, Promise<CatalogPage>>()
export async function audiusCatalog(env: Env, query: string, genre: string, offset: number): Promise<CatalogPage> {
  const key = JSON.stringify([query.toLowerCase(), genre, offset])
  const cached = await env.DB.prepare('SELECT track_ids_json,has_more,fetched_at FROM music_catalog_queries WHERE query_key=?1')
    .bind(key).first<{ track_ids_json: string; has_more: number; fetched_at: number }>()
  const readCached = async (): Promise<CatalogPage> => {
    let ids: string[] = []
    try { ids = JSON.parse(cached?.track_ids_json ?? '[]') } catch { /* Recover with fresh provider query. */ }
    if (!Array.isArray(ids)) ids = []
    const rows = ids.length ? await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.is_active=1 AND c.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<CatalogTrackRow>() : { results: [] }
    const tracks = new Map(rows.results.map(r => [r.id, catalogTrack(r)]))
    return { tracks: ids.flatMap(id => tracks.get(id) ?? []), status: 'cached', hasMore: cached?.has_more === 1 }
  }
  if (cached && Date.now() - cached.fetched_at < TTL) return readCached()
  const existing = pending.get(key)
  if (existing) return existing
  const operation = (async (): Promise<CatalogPage> => {
    try {
      const response = await audiusGet(env, query ? '/tracks/search' : '/tracks/trending', {
        ...(query ? { query } : { time: 'week' }), ...(genre ? { genre } : {}), limit: '24', offset: String(offset),
      })
      if (!Array.isArray(response.data)) throw new Error('AUDIUS_INVALID_RESPONSE')
      const unique = new Map<string, CatalogTrackRow>()
      for (const item of response.data) { const row = audiusCatalogRow(item); if (row) unique.set(row.id, row) }
      const rows = [...unique.values()], hasMore = response.data.length >= 24
      await env.DB.batch([...rows.map(r => audiusUpsert(env, r)), env.DB.prepare(`INSERT INTO music_catalog_queries(query_key,track_ids_json,has_more,fetched_at) VALUES (?1,?2,?3,?4)
        ON CONFLICT(query_key) DO UPDATE SET track_ids_json=excluded.track_ids_json,has_more=excluded.has_more,fetched_at=excluded.fetched_at`)
        .bind(key, JSON.stringify(rows.map(r => r.id)), hasMore ? 1 : 0, Date.now())])
      return { tracks: rows.map(catalogTrack), status: 'live', hasMore }
    } catch {
      const fallback = await readCached()
      return { ...fallback, status: 'offline' }
    }
  })()
  if (pending.size < 64) pending.set(key, operation)
  try { return await operation } finally { if (pending.get(key) === operation) pending.delete(key) }
}
