import { type Env } from '../../_shared'
import { audiusCatalog, audiusCatalogRow, audiusGet, audiusUpsert } from '../../_music-audius'
import { catalogTrack, CATALOG_VISUAL_COLUMNS, type CatalogTrackRow } from '../../_music-dither'
import { AUDIUS_GENRES } from '../../../src/music/genres'
import type { MusicTrackSummary } from '../../../src/music-domain'
import type { GalaxySongDetails } from '../../../src/music-api'

type GroupBy = 'song' | 'artist' | 'genre'
type ContentPage = {
  by: GroupBy; key: string; label: string; description: string | null
  tracks: MusicTrackSummary[]; hasMore: boolean; nextOffset: number | null
  songDetails?: GalaxySongDetails; relatedTracks?: MusicTrackSummary[]
  status: 'live' | 'cached' | 'local' | 'offline'
}
const PAGE_SIZE = 10
const MAX_OFFSET = 10000
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store' },
})
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

async function localPage(env: Env, by: 'artist' | 'genre', key: string, label: string, offset: number, status: 'local' | 'offline', excludeId = ''): Promise<ContentPage> {
  const condition = by === 'artist' ? 'c.artist_id=?1'
    : "EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(c.genres_json) THEN c.genres_json ELSE '[]' END) WHERE lower(value)=lower(?1))"
  const { results } = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c
    WHERE c.is_active=1 AND c.provider <> 'moodverse-demo' AND ${condition} AND c.id <> ?4
    ORDER BY c.title COLLATE NOCASE, c.artist_name COLLATE NOCASE, c.id LIMIT ?2 OFFSET ?3`)
    .bind(key, PAGE_SIZE + 1, offset, excludeId).all<CatalogTrackRow>()
  const hasMore = results.length > PAGE_SIZE && offset + PAGE_SIZE <= MAX_OFFSET
  return { by, key, label: by === 'artist' ? results[0]?.artist_name ?? label : label, description: null,
    tracks: results.slice(0, PAGE_SIZE).map(catalogTrack), hasMore, nextOffset: hasMore ? offset + PAGE_SIZE : null, status }
}

async function artistPage(env: Env, key: string, offset: number, excludeId = ''): Promise<ContentPage> {
  const id = key.slice('audius:'.length)
  const [profile, response] = await Promise.all([
    audiusGet(env, `/users/${id}`),
    audiusGet(env, `/users/${id}/tracks`, { offset: String(offset), limit: String(PAGE_SIZE + 1) }),
  ])
  const user: unknown = profile.data
  if (!isRecord(user) || user.id !== id || typeof user.name !== 'string' || !user.name.trim()
    || user.is_deactivated || user.is_available === false || !Array.isArray(response.data)) throw new Error('INVALID_ARTIST_CONTENT')
  const rows: CatalogTrackRow[] = [], seen = new Set<string>()
  let consumed = 0
  for (const value of response.data) {
    consumed++
    if (isRecord(value) && isRecord(value.access) && value.access.stream === false) continue
    const row = audiusCatalogRow(value)
    if (!row || row.artist_id !== key || row.id === excludeId || seen.has(row.id)) continue
    seen.add(row.id); rows.push(row)
    if (rows.length === PAGE_SIZE) break
  }
  // Offset counts provider records, including gated or malformed entries. This
  // avoids replaying/skipping eligible songs when a page contains filtered rows.
  const hasMore = response.data.length >= PAGE_SIZE + 1 && offset + consumed <= MAX_OFFSET
  if (rows.length) await env.DB.batch(rows.map(row => audiusUpsert(env, row)))
  return { by: 'artist', key, label: user.name.trim().slice(0, 200),
    description: typeof user.bio === 'string' && user.bio.trim() ? user.bio.trim().slice(0, 5000) : null,
    tracks: rows.map(catalogTrack), hasMore, nextOffset: hasMore ? offset + consumed : null, status: 'live' }
}

function songDetails(value: Record<string, unknown>): GalaxySongDetails {
  const text = (key: string, limit: number) => typeof value[key] === 'string' ? (value[key] as string).trim().slice(0, limit) || null : null
  const count = (key: string) => typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : null
  const releasedAt = text('release_date', 100)
  return {
    description: text('description', 5000), releasedAt: releasedAt && Number.isFinite(Date.parse(releasedAt)) ? releasedAt : null,
    bpm: typeof value.bpm === 'number' && Number.isFinite(value.bpm) && value.bpm >= 30 && value.bpm <= 300 ? value.bpm : null,
    musicalKey: text('musical_key', 80), tags: [...new Set((text('tags', 2000) ?? '').split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 20),
    playCount: count('play_count'), favoriteCount: count('favorite_count'), repostCount: count('repost_count'),
  }
}

async function songPage(env: Env, row: CatalogTrackRow, offset: number): Promise<ContentPage> {
  let track = catalogTrack(row)
  let details: GalaxySongDetails = { bpm: track.visualFeatures?.tempoBpm ?? null }
  const live = Boolean(env.AUDIUS_API_KEY && /^audius:[a-zA-Z0-9]{1,64}$/.test(row.id) && /^audius:[a-zA-Z0-9]{1,64}$/.test(row.artist_id))
  let detailsOffline = false
  const [, related] = await Promise.all([
    live ? (async () => {
      try {
        const response = await audiusGet(env, `/tracks/${row.id.slice(7)}`)
        const value = response.data
        const fresh = audiusCatalogRow(value)
        if (!isRecord(value) || !fresh || fresh.id !== row.id || fresh.artist_id !== row.artist_id
          || isRecord(value.access) && value.access.stream === false) throw new Error('INVALID_SONG_CONTENT')
        track = catalogTrack(fresh); details = songDetails(value)
      } catch { detailsOffline = true }
    })() : Promise.resolve(),
    (async () => {
      if (live) {
        try { return await artistPage(env, row.artist_id, offset, row.id) }
        catch { return localPage(env, 'artist', row.artist_id, row.artist_name, offset, 'offline', row.id) }
      }
      return localPage(env, 'artist', row.artist_id, row.artist_name, offset, 'local', row.id)
    })(),
  ])
  return { by: 'song', key: row.id, label: track.title, description: null, tracks: [track], songDetails: details,
    relatedTracks: related.tracks, hasMore: related.hasMore, nextOffset: related.nextOffset,
    status: detailsOffline ? 'offline' : related.status }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams
  const by = params.get('by'), key = params.get('key')?.trim() ?? '', rawOffset = params.get('offset') ?? '0'
  const offset = Number(rawOffset)
  if (!['song', 'artist', 'genre'].includes(by ?? '') || !key || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)
    || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > MAX_OFFSET
    || (by === 'artist' && key.startsWith('audius:') && !/^audius:[a-zA-Z0-9]{1,64}$/.test(key)))
    return respond({ error: 'INVALID_GALAXY_CONTENT_QUERY' }, 400)
  const genre = by === 'genre' ? AUDIUS_GENRES.find(value => value.toLowerCase() === key.toLowerCase()) : undefined
  if (by === 'genre' && !genre) return respond({ error: 'INVALID_GALAXY_CONTENT_QUERY' }, 400)
  try {
    if (by === 'song') {
      const row = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.id=?1 AND c.is_active=1`)
        .bind(key).first<CatalogTrackRow>()
      if (!row) return respond({ error: 'TRACK_NOT_FOUND' }, 404)
      return respond(await songPage(env, row, offset))
    }
    if (by === 'artist') {
      if (env.AUDIUS_API_KEY && key.startsWith('audius:')) {
        try { return respond(await artistPage(env, key, offset)) }
        catch { return respond(await localPage(env, 'artist', key, key, offset, 'offline')) }
      }
      return respond(await localPage(env, 'artist', key, key, offset, 'local'))
    }
    if (env.AUDIUS_API_KEY) {
      const page = await audiusCatalog(env, '', genre!, offset)
      const tracks = page.tracks.filter(track => track.genres.some(value => value.toLowerCase() === genre!.toLowerCase()))
      if (page.status !== 'offline' || tracks.length) {
        const hasMore = page.hasMore && offset + 24 <= MAX_OFFSET
        return respond({ by: 'genre', key, label: genre!, description: null, tracks,
          hasMore, nextOffset: hasMore ? offset + 24 : null, status: page.status } satisfies ContentPage)
      }
      return respond(await localPage(env, 'genre', key, genre!, offset, 'offline'))
    }
    return respond(await localPage(env, 'genre', key, genre!, offset, 'local'))
  } catch {
    return respond({ error: 'GALAXY_CONTENT_UNAVAILABLE' }, 503)
  }
}
