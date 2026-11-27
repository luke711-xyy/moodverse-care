import { authenticatedMusicUser, type Env } from '../../../../_shared'
import { decodeSocialRouteId } from '../../../../_music-social'
import { driftBottleResponse, getSentBottleJourney } from '../../../../_music-drift-bottles'

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return driftBottleResponse({ error: 'UNAUTHENTICATED' }, 401)
  const id = decodeSocialRouteId(params.id)
  if (!id) return driftBottleResponse({ error: 'BOTTLE_NOT_FOUND' }, 404)
  const result = await getSentBottleJourney(env, id, identity.userId)
  return driftBottleResponse(result.body, result.status)
}
