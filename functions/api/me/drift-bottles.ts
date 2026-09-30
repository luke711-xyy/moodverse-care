import { authenticatedMusicUser, json, type Env } from '../../_shared'
import {
  createDriftBottle,
  driftBottleResponse,
  listDriftBottles,
  parseDriftBottleInput,
} from '../../_music-drift-bottles'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  return driftBottleResponse(await listDriftBottles(env, identity.userId))
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const input = parseDriftBottleInput(await json<unknown>(request))
  if (!input) return driftBottleResponse({ error: 'INVALID_BOTTLE_TOPIC' }, 400)
  const result = await createDriftBottle(env, identity.userId, input)
  return driftBottleResponse(result.body, result.status)
}
