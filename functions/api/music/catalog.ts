import { type Env } from '../../_shared'
import { catalogTrack, type CatalogTrackRow, CATALOG_VISUAL_COLUMNS } from '../../_music-dither'
import { audiusCatalog } from '../../_music-audius'
import { AUDIUS_GENRES } from '../../../src/music/genres'
import { DEFAULT_TRACK_ID } from '../../../src/music/default-track'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams
  const search = params.get('q')?.trim().slice(0, 120) ?? ''
  const genre = params.get('genre')?.trim() ?? ''
  const offset = Number(params.get('offset') ?? 0)
  if (genre && !AUDIUS_GENRES.some(g => g === genre) || !Number.isInteger(offset) || offset < 0 || offset > 10000)
    return Response.json({ error: 'INVALID_CATALOG_QUERY' }, { status: 400 })
  let tracks, status = 'local', hasMore = false, pageSize = 50
  if (env.AUDIUS_API_KEY) {
    pageSize = 24
    const page = await audiusCatalog(env, search, genre, offset)
    tracks = page.tracks; status = page.status; hasMore = page.hasMore
    if (!search && !genre && offset === 0) {
      const local = await env.DB.prepare(`SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.id=?1 AND c.is_active=1`).bind(DEFAULT_TRACK_ID).first<CatalogTrackRow>()
      if (local) tracks = [catalogTrack(local), ...tracks]
    }
  } else {
  const { results } = await env.DB.prepare(`
    SELECT ${CATALOG_VISUAL_COLUMNS}
    FROM music_track_catalog c
    WHERE is_active = 1 AND provider <> 'moodverse-demo'
      AND (?1 = '' OR instr(lower(title), lower(?1)) > 0 OR instr(lower(artist_name), lower(?1)) > 0)
      AND (?2 = '' OR EXISTS(SELECT 1 FROM json_each(c.genres_json) WHERE value=?2))
    ORDER BY title COLLATE NOCASE, artist_name COLLATE NOCASE, id
    LIMIT 51 OFFSET ?3
  `).bind(search, genre, offset).all<CatalogTrackRow>()
  hasMore = results.length > 50
  tracks = results.slice(0, 50).map(catalogTrack)
  }
  hasMore = hasMore && offset + pageSize <= 10000
  return new Response(JSON.stringify({ tracks, status, hasMore, nextOffset: hasMore ? offset + pageSize : null, genres: AUDIUS_GENRES }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
}
