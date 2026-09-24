import { session, withCookie, type Env } from '../../_shared'

const MAX_BODY_BYTES = 185_000
const MAX_TEXTURE_BYTES = 128 * 1024
const DEFAULT_COLOR = '#ffd166'

type StarAppearancePayload = { color?: unknown; texture?: unknown }

async function readBoundedJson(request: Request): Promise<{ value: StarAppearancePayload | null; tooLarge: boolean }> {
  const headerLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(headerLength) && headerLength > MAX_BODY_BYTES) return { value: null, tooLarge: true }
  if (!request.body) return { value: null, tooLarge: false }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        return { value: null, tooLarge: true }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return { value: value && typeof value === 'object' ? value as StarAppearancePayload : null, tooLarge: false }
  } catch {
    return { value: null, tooLarge: false }
  }
}

function validAppearance(payload: StarAppearancePayload | null) {
  if (!payload || typeof payload.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload.color)) return null
  const texture = payload.texture === undefined || payload.texture === '' ? '' : payload.texture
  if (typeof texture !== 'string') return null
  if (!texture) return { color: payload.color, texture: '' }
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(texture)
  if (!match || match[1].length > Math.ceil(MAX_TEXTURE_BYTES * 4 / 3)) return null
  try {
    const binary = atob(match[1])
    if (binary.length < 16 || binary.length > MAX_TEXTURE_BYTES) return null
    if (binary.slice(0, 4) !== 'RIFF' || binary.slice(8, 12) !== 'WEBP') return null
  } catch {
    return null
  }
  return { color: payload.color, texture }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  const row = await env.DB.prepare('SELECT star_color, star_texture_webp FROM users WHERE id = ?1').bind(active.userId).first<{ star_color: string; star_texture_webp: string }>()
  return withCookie({ starAppearance: { color: row?.star_color ?? DEFAULT_COLOR, texture: row?.star_texture_webp || undefined } }, active)
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const active = await session(request, env)
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return withCookie({ error: 'UNSUPPORTED_MEDIA_TYPE' }, active, 415)
  }
  const { value, tooLarge } = await readBoundedJson(request)
  if (tooLarge) return withCookie({ error: 'PAYLOAD_TOO_LARGE' }, active, 413)
  const appearance = validAppearance(value)
  if (!appearance) return withCookie({ error: 'INVALID_STAR_APPEARANCE' }, active, 400)
  const updatedAt = new Date().toISOString()
  await env.DB.prepare('UPDATE users SET star_color = ?1, star_texture_webp = ?2, updated_at = ?3 WHERE id = ?4')
    .bind(appearance.color, appearance.texture, updatedAt, active.userId).run()
  return withCookie({ ok: true, starAppearance: { color: appearance.color, texture: appearance.texture || undefined } }, active)
}
