import { authenticatedMusicUser, json, type Env } from '../../../_shared'
import { MomentPhotoError, readPhotoMoment } from '../../../_music-moment-photo'
import { MOMENT_PHOTO_PATH } from '../../../../src/music/moment-photo'
import {
  contentText,
  isRecord,
  mapMoment,
  ownedPlanetId,
  photoUrl,
  readMoment,
  type MomentInput,
  type MomentRow,
} from '../../../_music-moments'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)
  const planetId = await ownedPlanetId(env, identity.userId)
  if (!planetId) return respond({ moments: [] })

  const { results } = await env.DB.prepare(`
    SELECT m.id, m.track_id, m.content_text, m.photo_url, m.visibility, m.published_at, m.created_at, m.updated_at,
           c.title, c.artist_id, c.artist_name, c.version_label, c.genres_json, c.mood_tags_json,
           c.official_url, c.cover_url, c.duration_seconds, c.provider, c.visual_features_json
    FROM music_moments m
    JOIN music_track_catalog c ON c.id = m.track_id
    WHERE m.planet_id = ?1
    ORDER BY m.created_at DESC, m.id DESC
  `).bind(planetId).all<MomentRow>()
  return respond({ moments: results.map(mapMoment) })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)
  const planetId = await ownedPlanetId(env, identity.userId)
  if (!planetId) return respond({ error: 'PLANET_NOT_FOUND' }, 404)

  let body: MomentInput | null
  let photo: Awaited<ReturnType<typeof readPhotoMoment>>['photo'] | undefined
  try {
    if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      const upload = await readPhotoMoment(request)
      body = upload.input; photo = upload.photo
    } else body = await json<MomentInput>(request)
  } catch (error) {
    if (error instanceof MomentPhotoError) return respond({ error: error.code }, error.status)
    return respond({ error: 'INVALID_MOMENT' }, 400)
  }
  if (!isRecord(body)) return respond({ error: 'INVALID_MOMENT' }, 400)
  const trackId = typeof body.trackId === 'string' ? body.trackId.trim() : ''
  const text = contentText(body.contentText)
  let image = photoUrl(body.photoUrl)
  const visibility = body.visibility === undefined ? 'public' : body.visibility
  if (!trackId || text === null || image === undefined || (visibility !== 'public' && visibility !== 'private')) {
    return respond({ error: 'INVALID_MOMENT' }, 400)
  }

  const track = await env.DB.prepare('SELECT id FROM music_track_catalog WHERE id = ?1 AND is_active = 1')
    .bind(trackId).first<{ id: string }>()
  if (!track) return respond({ error: 'UNKNOWN_OR_INACTIVE_TRACK' }, 400)

  const momentId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const publishedAt = visibility === 'public' ? timestamp : null
  const objectKey = `moment-photos/${momentId}`
  if (photo) {
    if (!env.MUSIC_MEDIA) return respond({ error: 'PHOTO_STORAGE_UNAVAILABLE' }, 503)
    try {
      await env.MUSIC_MEDIA.put(objectKey, photo.bytes, { httpMetadata: { contentType: photo.type }, customMetadata: { ownerUserId: identity.userId } })
      image = `${MOMENT_PHOTO_PATH}${momentId}`
    } catch { return respond({ error: 'PHOTO_STORAGE_UNAVAILABLE' }, 503) }
  }
  try { await env.DB.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, photo_url, visibility, published_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
  `).bind(momentId, planetId, trackId, text, image, visibility, publishedAt, timestamp).run() }
  catch (error) {
    // No published row: remove only the object created by this failed request.
    if (photo) await env.MUSIC_MEDIA?.delete(objectKey).catch(() => {})
    console.error('Moment save failed', error instanceof Error ? error.message : 'database error')
    return respond({ error: 'MOMENT_SAVE_FAILED' }, 503)
  }

  const saved = await readMoment(env, planetId, momentId)
  return respond({ moment: saved ? mapMoment(saved) : null }, 201)
}
