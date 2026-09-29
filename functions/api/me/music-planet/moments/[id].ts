import { authenticatedMusicUser, json, type Env } from '../../../../_shared'
import { schedulePlanetComposition } from '../compose'
import {
  contentText,
  isRecord,
  mapMoment,
  own,
  ownedPlanetId,
  photoUrl,
  readMoment,
  type MomentInput,
  type MomentRow,
} from '../../../../_music-moments'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const body = await json<MomentInput>(request)
  if (!isRecord(body)) return respond({ error: 'INVALID_MOMENT_UPDATE' }, 400)
  const hasTrack = own(body, 'trackId')
  const hasText = own(body, 'contentText')
  const hasPhoto = own(body, 'photoUrl')
  const hasVisibility = own(body, 'visibility')
  if (!hasTrack && !hasText && !hasPhoto && !hasVisibility) {
    return respond({ error: 'EMPTY_MOMENT_UPDATE' }, 400)
  }

  const momentId = typeof params?.id === 'string' ? params.id : ''
  const current = momentId
    ? await env.DB.prepare(`
        SELECT m.id, m.track_id, m.content_text, m.photo_url, m.visibility, m.published_at,
               m.created_at, m.updated_at, c.title, c.artist_id, c.artist_name, c.version_label,
               c.genres_json, c.mood_tags_json, c.official_url, c.cover_url, c.duration_seconds
        FROM music_moments m
        JOIN music_track_catalog c ON c.id = m.track_id
        JOIN music_planets p ON p.id = m.planet_id
        WHERE m.id = ?1 AND p.owner_user_id = ?2
      `).bind(momentId, identity.userId).first<MomentRow>()
    : null
  if (!current) return respond({ error: 'MOMENT_NOT_FOUND' }, 404)

  const trackId = hasTrack
    ? (typeof body.trackId === 'string' ? body.trackId.trim() : '')
    : current.track_id
  const text = hasText ? contentText(body.contentText) : current.content_text
  const image = hasPhoto ? photoUrl(body.photoUrl) : current.photo_url
  const visibility = hasVisibility ? body.visibility : current.visibility
  if (!trackId || text === null || image === undefined || (visibility !== 'public' && visibility !== 'private')) {
    return respond({ error: 'INVALID_MOMENT_UPDATE' }, 400)
  }

  if (hasTrack) {
    const track = await env.DB.prepare('SELECT id FROM music_track_catalog WHERE id = ?1 AND is_active = 1')
      .bind(trackId).first<{ id: string }>()
    if (!track) return respond({ error: 'UNKNOWN_OR_INACTIVE_TRACK' }, 400)
  }

  const timestamp = new Date().toISOString()
  const publishedAt = visibility === 'private'
    ? null
    : current.visibility !== 'public' || current.published_at === null
      ? timestamp
      : current.published_at
  const updated = await env.DB.prepare(`
    UPDATE music_moments
    SET track_id = ?1, content_text = ?2, photo_url = ?3, visibility = ?4,
        published_at = ?5, updated_at = ?6
    WHERE id = ?7
      AND planet_id IN (SELECT id FROM music_planets WHERE owner_user_id = ?8)
  `).bind(trackId, text, image, visibility, publishedAt, timestamp, momentId, identity.userId).run()
  if (updated.meta.changes !== 1) return respond({ error: 'MOMENT_NOT_FOUND' }, 404)

  const planetId = await ownedPlanetId(env, identity.userId)
  const saved = planetId ? await readMoment(env, planetId, momentId) : null
  const composition = current.visibility === 'public' || visibility === 'public'
    ? await schedulePlanetComposition(env, identity.userId, (task) => context.waitUntil(task))
    : null
  return respond({
    moment: saved ? mapMoment(saved) : null,
    ...(composition?.state === 'queued'
      ? { compositionTask: { id: composition.taskId, status: 'queued' } }
      : {}),
  })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)
  const momentId = typeof params?.id === 'string' ? params.id : ''
  if (!momentId) return respond({ error: 'MOMENT_NOT_FOUND' }, 404)

  const existing = await env.DB.prepare(`
    SELECT m.visibility
    FROM music_moments m
    JOIN music_planets p ON p.id = m.planet_id
    WHERE m.id = ?1 AND p.owner_user_id = ?2
  `).bind(momentId, identity.userId).first<{ visibility: 'public' | 'private' }>()
  if (!existing) return respond({ error: 'MOMENT_NOT_FOUND' }, 404)

  const deleted = await env.DB.prepare(`
    DELETE FROM music_moments
    WHERE id = ?1
      AND planet_id IN (SELECT id FROM music_planets WHERE owner_user_id = ?2)
  `).bind(momentId, identity.userId).run()
  if (deleted.meta.changes !== 1) return respond({ error: 'MOMENT_NOT_FOUND' }, 404)
  const composition = existing.visibility === 'public'
    ? await schedulePlanetComposition(env, identity.userId, (task) => context.waitUntil(task))
    : null
  return respond({
    deleted: true,
    ...(composition?.state === 'queued'
      ? { compositionTask: { id: composition.taskId, status: 'queued' } }
      : {}),
  })
}
