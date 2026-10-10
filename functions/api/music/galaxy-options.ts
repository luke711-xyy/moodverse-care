import type { Env } from '../../_shared'
import { audiusCatalog } from '../../_music-audius'
import type { GalaxySelectionOption } from '../../../src/music/galaxy-preferences'
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const params = new URL(request.url).searchParams, by = params.get('by'), q = params.get('q')?.trim() ?? ''
  const rawOffset = params.get('offset') ?? '0', offset = Number(rawOffset)
  if (!['artist','song'].includes(by ?? '') || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)
    || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 10000)
    return Response.json({ error: 'INVALID_GALAXY_OPTIONS_QUERY' }, { status: 400 })
  // Reuse the public catalog integration; provider errors leave local choices usable.
  if (q && offset === 0 && env.AUDIUS_API_KEY) {
    try { await audiusCatalog(env, q, '', 0) } catch { /* cached catalog remains available */ }
  }
  const { results } = await env.DB.prepare(by === 'artist' ? `
    SELECT artist_id AS id, min(artist_name) AS label FROM music_track_catalog
    WHERE is_active=1 AND provider<>'moodverse-demo' AND trim(artist_id)<>'' AND trim(artist_name)<>''
      AND (?1='' OR instr(lower(artist_name),lower(?1))>0)
    GROUP BY artist_id ORDER BY label COLLATE NOCASE,id LIMIT 13 OFFSET ?2` : `
    SELECT id, title || ' · ' || artist_name AS label FROM music_track_catalog
    WHERE is_active=1 AND provider<>'moodverse-demo'
      AND (?1='' OR instr(lower(title),lower(?1))>0 OR instr(lower(artist_name),lower(?1))>0)
    ORDER BY title COLLATE NOCASE,artist_name COLLATE NOCASE,id LIMIT 13 OFFSET ?2`)
    .bind(q, offset).all<GalaxySelectionOption>()
  const hasMore = results.length > 12 && offset + 12 <= 10000
  return Response.json({ options: results.slice(0,12), hasMore, nextOffset: hasMore ? offset + 12 : null }, { headers: { 'cache-control': 'no-store' } })
}
