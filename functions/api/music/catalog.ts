import { type Env } from '../../_shared'
import type { MusicTrackSummary } from '../../../src/music-domain'
import { catalogTrack, type CatalogTrackRow, CATALOG_VISUAL_COLUMNS } from '../../_music-dither'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) ?? ''
  const { results } = await env.DB.prepare(`
    SELECT ${CATALOG_VISUAL_COLUMNS}
    FROM music_track_catalog c
    WHERE is_active = 1
      AND (?1 = '' OR instr(lower(title), lower(?1)) > 0 OR instr(lower(artist_name), lower(?1)) > 0)
    ORDER BY title COLLATE NOCASE, artist_name COLLATE NOCASE, id
    LIMIT 50
  `).bind(search).all<CatalogTrackRow>()

  const tracks: MusicTrackSummary[] = results.map(catalogTrack)

  return new Response(JSON.stringify({ tracks }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
}
