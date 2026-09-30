import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { isSocialRecord, socialResponse } from '../../_music-social'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)

  const [social, drift] = await Promise.all([
    env.DB.prepare(`SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = ?1`)
      .bind(identity.userId).first<{ allow_friend_requests: number }>(),
    env.DB.prepare(`SELECT allow_receiving FROM music_drift_preferences WHERE user_id = ?1`)
      .bind(identity.userId).first<{ allow_receiving: number }>(),
  ])
  return socialResponse({
    allowFriendRequests: social?.allow_friend_requests !== 0,
    allowDriftBottles: drift?.allow_receiving !== 0,
  })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)

  const payload = await json<unknown>(request)
  if (!isSocialRecord(payload) || Object.keys(payload).length === 0
    || Object.keys(payload).some((key) => !['allowFriendRequests', 'allowDriftBottles'].includes(key))
    || ('allowFriendRequests' in payload && typeof payload.allowFriendRequests !== 'boolean')
    || ('allowDriftBottles' in payload && typeof payload.allowDriftBottles !== 'boolean')) {
    return socialResponse({ error: 'INVALID_SOCIAL_SETTINGS' }, 400)
  }
  const now = new Date().toISOString()
  const statements = []
  if (typeof payload.allowFriendRequests === 'boolean') statements.push(env.DB.prepare(`
    INSERT INTO music_social_preferences (user_id, allow_friend_requests, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET allow_friend_requests = excluded.allow_friend_requests, updated_at = excluded.updated_at
  `).bind(identity.userId, payload.allowFriendRequests ? 1 : 0, now))
  if (typeof payload.allowDriftBottles === 'boolean') statements.push(env.DB.prepare(`
    INSERT INTO music_drift_preferences (user_id, allow_receiving, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET allow_receiving = excluded.allow_receiving, updated_at = excluded.updated_at
  `).bind(identity.userId, payload.allowDriftBottles ? 1 : 0, now))
  await env.DB.batch(statements)
  const result = await onRequestGet({ request, env } as never)
  return result
}
