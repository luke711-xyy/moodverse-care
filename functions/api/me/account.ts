import { authenticatedMusicUser, type Env } from '../../_shared'
import { deleteMusicAccount, hasSameOrigin } from '../../_music-email-auth'

const originDenied = () => new Response(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }), {
  status: 403,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasSameOrigin(request)) return originDenied()
  const identity = await authenticatedMusicUser(request, env)
  return deleteMusicAccount(request, env, identity)
}
