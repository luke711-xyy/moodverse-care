import { verifyMusicEmailCode } from '../../../_music-email-auth'
import type { Env } from '../../../_shared'

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => env.MUSIC_EMAIL_LOGIN_ENABLED?.trim() === 'true'
  ? verifyMusicEmailCode(request, env)
  : new Response(JSON.stringify({ error: 'EMAIL_LOGIN_DISABLED' }), {
      status: 410,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
