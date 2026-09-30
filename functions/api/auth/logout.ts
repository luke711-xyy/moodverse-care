import { logoutMusicSession } from '../../_music-email-auth'
import type { Env } from '../../_shared'

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => logoutMusicSession(request, env)
