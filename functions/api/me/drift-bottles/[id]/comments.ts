import { authenticatedMusicUser, json, type Env } from '../../../../_shared'
import {
  addDriftBottleComment,
  driftBottleResponse,
} from '../../../../_music-drift-bottles'

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const result = await addDriftBottleComment(env, String(params.id ?? ''), identity.userId, await json<unknown>(request))
  return driftBottleResponse(result.body, result.status)
}
