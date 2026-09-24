import { session, withCookie, type Env } from '../_shared'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  return withCookie({ ok: true, userId: active.userId }, active)
}

export const onRequestGet: PagesFunction<Env> = onRequestPost
