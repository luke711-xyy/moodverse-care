import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { socialResponse, isSocialRecord } from '../../_music-social'
import {
  actOnIntroduction,
  parseIntroductionProfile,
  readIntroductionChannel,
  saveIntroductionProfile,
  socialIntroductionsEnabled,
} from '../../_music-copilot-social'

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!socialIntroductionsEnabled(env)) return socialResponse({ error: 'COPILOT_SOCIAL_DISABLED' }, 503)
  const origin = request.headers.get('origin'),
    method = request.method
  if (!['GET', 'PATCH', 'POST'].includes(method)) return socialResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (
    (origin && origin !== new URL(request.url).origin) ||
    (method !== 'GET' && !origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return socialResponse({ error: 'FORBIDDEN' }, 403)
  }
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const { userId } = identity
  if (method === 'PATCH') {
    const profile = parseIntroductionProfile(await json<unknown>(request))
    if (!profile) return socialResponse({ error: 'INVALID_PUBLIC_CARD' }, 400)
    if (!(await saveIntroductionProfile(env, userId, profile)))
      return socialResponse({ error: 'SHARING_UNAVAILABLE' }, 409)
  } else if (method === 'POST') {
    const body = await json<unknown>(request)
    if (
      !isSocialRecord(body) ||
      Object.keys(body).length !== 2 ||
      typeof body.id !== 'string' ||
      !body.id ||
      body.id.length > 128 ||
      !['approve', 'decline', 'mute', 'restore'].includes(String(body.action))
    )
      return socialResponse({ error: 'INVALID_INTRODUCTION_ACTION' }, 400)
    if (
      !(await actOnIntroduction(env, userId, body.id, body.action as 'approve' | 'decline' | 'mute' | 'restore'))
    ) {
      return socialResponse({ error: 'INTRODUCTION_UNAVAILABLE' }, 409)
    }
  }
  const response = socialResponse(await readIntroductionChannel(env, userId))
  if (identity.setCookie) response.headers.append('Set-Cookie', identity.setCookie)
  return response
}
