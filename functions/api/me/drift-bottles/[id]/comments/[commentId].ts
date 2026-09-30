import { authenticatedMusicUser, type Env } from '../../../../../_shared'
import {
  deleteDriftBottleComment,
  driftBottleResponse,
} from '../../../../../_music-drift-bottles'

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const result = await deleteDriftBottleComment(env, String(params.id ?? ''), String(params.commentId ?? ''), identity.userId)
  return driftBottleResponse(result.body, result.status)
}
