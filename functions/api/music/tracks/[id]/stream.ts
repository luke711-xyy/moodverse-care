import { type Env, safeHttpsUrl } from '../../../../_shared'
import { audiusGet } from '../../../../_music-audius'

/** Resolve a short-lived public MP3 URL; the browser never receives the API key. */
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  let id: string
  try { id = decodeURIComponent(String(params.id ?? '')) } catch { return Response.json({ error: 'INVALID_TRACK' }, { status: 400 }) }
  if (!/^audius:[a-zA-Z0-9]{1,64}$/.test(id)) return Response.json({ error: 'INVALID_TRACK' }, { status: 400 })
  const row = await env.DB.prepare("SELECT provider_track_id FROM music_track_catalog WHERE id=?1 AND provider='audius' AND is_active=1")
    .bind(id).first<{ provider_track_id: string }>()
  if (!row || row.provider_track_id !== id.slice(7)) return Response.json({ error: 'TRACK_NOT_FOUND' }, { status: 404 })
  try {
    const metadata = await audiusGet(env, `/tracks/${encodeURIComponent(row.provider_track_id)}`)
    const track = metadata.data
    if (!track || track.is_available === false || track.is_streamable === false || track.is_stream_gated || track.is_delete || track.is_unlisted)
      return Response.json({ error: 'TRACK_UNAVAILABLE' }, { status: 410 })
    const result = await audiusGet(env, `/tracks/${encodeURIComponent(row.provider_track_id)}/stream`, { no_redirect: 'true' })
    const destination = safeHttpsUrl(result.data ?? result.url)
    if (!destination) throw new Error('INVALID_STREAM')
    const url = new URL(destination)
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')
      || [...url.searchParams.keys()].some(k => /api.?key|authorization/i.test(k)) || env.AUDIUS_API_KEY && destination.includes(env.AUDIUS_API_KEY)) throw new Error('INVALID_STREAM')
    return new Response(null, { status: 302, headers: { location: destination, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
  } catch { return Response.json({ error: 'AUDIO_UNAVAILABLE' }, { status: 502, headers: { 'cache-control': 'no-store' } }) }
}
