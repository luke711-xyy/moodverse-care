import { requestMusicEmailCode } from '../../../_music-email-auth'
import type { Env } from '../../../_shared'

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => requestMusicEmailCode(request, env)
