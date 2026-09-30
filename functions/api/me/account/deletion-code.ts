import { authenticatedMusicUser, type Env } from '../../../_shared'
import { hasSameOrigin, requestMusicAccountDeletionCode } from '../../../_music-email-auth'

const originDenied = () => new Response(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }), {
  status: 403,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasSameOrigin(request)) return originDenied()
  const identity = await authenticatedMusicUser(request, env)
  return requestMusicAccountDeletionCode(request, env, identity)
}
