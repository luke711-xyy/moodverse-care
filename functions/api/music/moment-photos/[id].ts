import { authenticatedMusicUser, type Env } from '../../../_shared'
import { MOMENT_PHOTO_PATH } from '../../../../src/music/moment-photo'

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = typeof params.id === 'string' ? params.id : ''
  const unavailable = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  if (!/^[a-f0-9-]{36}$/.test(id) || !env.MUSIC_MEDIA) return unavailable()
  // Public image fetches need no new anonymous account of their own.
  const hasIdentity = request.headers.has('Cf-Access-Jwt-Assertion')
    || request.headers.get('Cookie')?.includes(`${env.MUSIC_ANON_SESSION_COOKIE ?? 'mv_session'}=`)
  const identity = hasIdentity ? await authenticatedMusicUser(request, env) : null
  // Check live visibility on every read, including previously known photo links.
  const row = await env.DB.prepare(`
    SELECT m.id FROM music_moments m
    JOIN music_planets p ON p.id = m.planet_id
    JOIN music_track_catalog c ON c.id = m.track_id
    WHERE m.id = ?1 AND m.photo_url = ?2 AND (
      p.owner_user_id = ?3 OR (
        p.visibility = 'public' AND m.visibility = 'public' AND m.published_at IS NOT NULL AND c.is_active = 1
        AND (?3 IS NULL OR NOT EXISTS (
          SELECT 1 FROM music_user_blocks b
          WHERE (b.blocker_user_id = ?3 AND b.blocked_user_id = p.owner_user_id)
             OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?3)
        ))
      )
    )
  `).bind(id, `${MOMENT_PHOTO_PATH}${id}`, identity?.userId ?? null).first()
  if (!row) return unavailable()
  const object = await env.MUSIC_MEDIA.get(`moment-photos/${id}`)
  if (!object || !['image/png','image/jpeg'].includes(object.httpMetadata?.contentType ?? '')) return unavailable()
  return new Response(object.body, { headers: {
    'content-type': object.httpMetadata!.contentType!,
    'content-length': String(object.size),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'cross-origin-resource-policy': 'same-origin',
  } })
}
