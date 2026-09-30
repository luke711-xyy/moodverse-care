import { authenticatedMusicUser, json, type Env } from '../../../_shared'
import {
  driftBottleResponse,
  getDriftBottleDetails,
  isDriftBottleRecord,
  openOrReleaseDriftBottle,
} from '../../../_music-drift-bottles'

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const result = await getDriftBottleDetails(env, String(params.id ?? ''), identity.userId)
  return driftBottleResponse(result.body, result.status)
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const payload = await json<unknown>(request)
  if (!isDriftBottleRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.action !== 'string') {
    return driftBottleResponse({ error: 'INVALID_BOTTLE_ACTION' }, 400)
  }
  const result = await openOrReleaseDriftBottle(env, String(params.id ?? ''), identity.userId, payload.action)
  return driftBottleResponse(result.body, result.status)
}
