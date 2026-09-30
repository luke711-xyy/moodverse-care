import { authenticatedMusicUser, type Env } from '../../../../../../_shared'
import {
  driftBottleResponse,
  setDriftBottleCommentLike,
} from '../../../../../../_music-drift-bottles'

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const result = await setDriftBottleCommentLike(env, String(params.id ?? ''), String(params.commentId ?? ''), identity.userId, true)
  return driftBottleResponse(result.body, result.status)
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const result = await setDriftBottleCommentLike(env, String(params.id ?? ''), String(params.commentId ?? ''), identity.userId, false)
  return driftBottleResponse(result.body, result.status)
}
