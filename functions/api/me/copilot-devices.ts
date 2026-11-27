import { authenticatedMusicUser, withCookie, type Env } from '../../_shared'
import { isSocialRecord } from '../../_music-social'

export async function hashDeviceSecret(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await authenticatedMusicUser(request, env)
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  const { results } = await env.DB.prepare('SELECT id, paired_at AS pairedAt FROM music_copilot_devices WHERE user_id=? AND token_hash IS NOT NULL AND expires_at>? ORDER BY paired_at DESC')
    .bind(user.userId, Date.now()).all()
  return withCookie({ devices: results }, user)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return Response.json({ error: 'ORIGIN_REQUIRED' }, { status: 403 })
  const user = await authenticatedMusicUser(request, env)
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  const input = await request.json().catch(() => null)
  if (!isSocialRecord(input)) return withCookie({ error: 'INVALID_REQUEST' }, user, 400)
  if (input.action === 'revoke' && typeof input.id === 'string') {
    await env.DB.prepare('DELETE FROM music_copilot_devices WHERE id=? AND user_id=?').bind(input.id, user.userId).run()
    return withCookie({ ok: true }, user)
  }
  if (input.action !== 'create') return withCookie({ error: 'INVALID_REQUEST' }, user, 400)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => alphabet[x & 31]).join('')
  const now = Date.now()
  const expiresAt = now + 5 * 60_000
  await env.DB.batch([
    env.DB.prepare('DELETE FROM music_copilot_devices WHERE expires_at<=? OR (user_id=? AND paired_at IS NULL)').bind(now,user.userId),
    env.DB.prepare('INSERT INTO music_copilot_devices(id,user_id,code_hash,issued_at,expires_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user.userId,await hashDeviceSecret(code),now,expiresAt),
  ])
  return withCookie({ code: code.match(/.{4}/g)!.join('-'), expiresAt }, user)
}
