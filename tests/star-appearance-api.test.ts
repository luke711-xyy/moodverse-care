import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('../functions/_shared', () => ({
  session: mocks.session,
  withCookie: (body: unknown, _active: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
}))

import { onRequestGet, onRequestPut } from '../functions/api/me/star-appearance'

function context(request: Request, row = { star_color: '#ffd166', star_texture_webp: '' }) {
  const run = vi.fn(async () => ({ success: true }))
  const first = vi.fn(async () => row)
  const prepare = vi.fn(() => ({ bind: () => ({ first, run }) }))
  return { value: { request, env: { DB: { prepare } } } as never, run, first, prepare }
}

const validWebp = () => {
  const bytes = new Uint8Array(20)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  bytes.set(new TextEncoder().encode('VP8 '), 12)
  return 'data:image/webp;base64,' + btoa(String.fromCharCode(...bytes))
}

describe('personal star appearance endpoint', () => {
  beforeEach(() => mocks.session.mockResolvedValue({ userId: 'owner-1', setCookie: null }))

  it('returns appearance without changing the stored account', async () => {
    const ctx = context(new Request('https://moodverse.test/api/me/star-appearance'))
    const response = await onRequestGet(ctx.value)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ starAppearance: { color: '#ffd166', texture: undefined } })
    expect(ctx.prepare).toHaveBeenCalledWith('SELECT star_color, star_texture_webp FROM users WHERE id = ?1')
    expect(ctx.run).not.toHaveBeenCalled()
  })

  it('accepts a bounded WebP data URI and persists only the current user fields', async () => {
    const appearance = { color: '#9ce8ce', texture: validWebp() }
    const ctx = context(new Request('https://moodverse.test/api/me/star-appearance', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(appearance),
    }))
    const response = await onRequestPut(ctx.value)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, starAppearance: appearance })
    expect(ctx.prepare).toHaveBeenCalledWith('UPDATE users SET star_color = ?1, star_texture_webp = ?2, updated_at = ?3 WHERE id = ?4')
    expect(ctx.run).toHaveBeenCalledOnce()
  })

  it('rejects invalid formats and oversized payloads before database writes', async () => {
    const invalid = context(new Request('https://moodverse.test/api/me/star-appearance', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ color: '#123456', texture: 'data:image/png;base64,AAAA' }),
    }))
    expect((await onRequestPut(invalid.value)).status).toBe(400)
    expect(invalid.run).not.toHaveBeenCalled()

    const large = context(new Request('https://moodverse.test/api/me/star-appearance', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': '200000' }, body: '{}',
    }))
    expect((await onRequestPut(large.value)).status).toBe(413)
    expect(large.run).not.toHaveBeenCalled()
  })
})
