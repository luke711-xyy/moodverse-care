import { authenticatedMusicUser, type Env } from '../../_shared'
import { readFriendSatellites } from '../../_music-friend-satellites'

const response = (body: unknown, status = 200, setCookie?: string | null) => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return response({ error: 'UNAUTHENTICATED' }, 401)
  return response({ friendSatellites: await readFriendSatellites(env, identity.userId) }, 200, identity.setCookie)
}
