import { afterEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser, type Env } from '../functions/_shared'
import { onRequestPost as requestDeletionCode } from '../functions/api/me/account/deletion-code'
import { onRequestDelete as deleteAccount } from '../functions/api/me/account'
import { onRequestPost as requestLoginCode } from '../functions/api/auth/email/request'
import { onRequestPost as verifyLoginCode } from '../functions/api/auth/email/verify'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const makeContext = (request: Request, env: Env) => ({ request, env }) as unknown as PagesFunctionEvent<Env>
const AUTH_SECRET = 'test-account-deletion-secret-at-least-32-characters'

let fixture: ReturnType<typeof createMusicApiFixture>
let emailApiCalls: Array<{ url: string; init?: RequestInit }>

function env() {
  return createMusicApiEnv(fixture.db, {
    MUSIC_EMAIL_LOGIN_ENABLED: 'true',
    MUSIC_AUTH_SECRET: AUTH_SECRET,
    MUSIC_EMAIL_FROM: 'login@moodverse.example',
    MUSIC_EMAIL_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    MUSIC_EMAIL_API_TOKEN: 'cf-email-api-token-for-tests-000000',
  })
}

function installEmailApi() {
  emailApiCalls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    emailApiCalls.push({ url: String(input), init })
    const payload = typeof init?.body === 'string' ? JSON.parse(init.body) as { to?: string } : {}
    return Response.json({ success: true, errors: [], result: { delivered: [payload.to] } })
  }))
}

function lastSentCode() {
  const body = emailApiCalls.at(-1)?.init?.body
  const message = typeof body === 'string' ? JSON.parse(body) as { text?: string } : undefined
  const code = message?.text?.match(/\b(\d{6})\b/)?.[1]
  if (!code) throw new Error('Expected the fake Cloudflare transport to receive a six-digit code')
  return code
}

function authRequest(path: string, method: string, cookie: string, body?: unknown, origin = 'https://moodverse.test') {
  return new Request(`https://moodverse.test${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function signIn(email: string) {
  const loginRequest = new Request('https://moodverse.test/api/auth/email/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: 'https://moodverse.test' },
    body: JSON.stringify({ email }),
  })
  expect((await requestLoginCode(makeContext(loginRequest, env()))).status).toBe(200)
  const code = lastSentCode()
  const verifyRequest = new Request('https://moodverse.test/api/auth/email/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: 'https://moodverse.test' },
    body: JSON.stringify({ email, code }),
  })
  const response = await verifyLoginCode(makeContext(verifyRequest, env()))
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  const identity = await authenticatedMusicUser(new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: cookie } }), env())
  if (!identity) throw new Error('Expected a verified email session')
  return { cookie, identity }
}

afterEach(() => {
  fixture?.close()
  vi.unstubAllGlobals()
})

test('deletion-code requests require an authenticated same-origin account and do not expose the code', async () => {
  fixture = createMusicApiFixture()
  installEmailApi()
  const { cookie, identity } = await signIn('luna@example.com')

  const anonymous = await requestDeletionCode(makeContext(authRequest('/api/me/account/deletion-code', 'POST', ''), env()))
  expect(anonymous.status).toBe(401)
  const crossOrigin = await requestDeletionCode(makeContext(authRequest('/api/me/account/deletion-code', 'POST', cookie, undefined, 'https://attacker.example'), env()))
  expect(crossOrigin.status).toBe(403)

  const response = await requestDeletionCode(makeContext(authRequest('/api/me/account/deletion-code', 'POST', cookie), env()))
  expect(response.status).toBe(200)
  const responseBody = await response.json()
  expect(responseBody).toEqual({ ok: true })
  expect(JSON.stringify(responseBody)).not.toContain('luna@example.com')
  const sent = emailApiCalls.at(-1)
  expect(JSON.parse(String(sent?.init?.body))).toMatchObject({ to: 'luna@example.com', subject: '确认删除你的 Moodverse 账号' })

  const code = lastSentCode()
  const challenge = fixture.sqlite.prepare('SELECT user_id, code_hash, attempts FROM music_account_deletion_codes').get() as {
    user_id: string; code_hash: string; attempts: number
  }
  expect(challenge).toEqual({ user_id: identity.userId, code_hash: expect.stringMatching(/^[a-f0-9]{64}$/), attempts: 0 })
  expect(challenge.code_hash).not.toContain(code)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users WHERE id = ?').get(identity.userId)).toEqual({ count: 1 })
})

test('account deletion requires the emailed code and exact confirmation, then cascades private account data', async () => {
  fixture = createMusicApiFixture()
  installEmailApi()
  const { cookie, identity } = await signIn('luna@example.com')
  const requested = await requestDeletionCode(makeContext(authRequest('/api/me/account/deletion-code', 'POST', cookie), env()))
  expect(requested.status).toBe(200)
  const code = lastSentCode()

  insertCatalogTrack(fixture.sqlite, { id: 'deletion-track' })
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES ('deletion-planet', ?, 'Luna', '继续听。', 'public', '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')
  `).run(identity.userId)
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES ('deletion-planet', 'deletion-track', 0, 1, '2026-09-30T00:00:00.000Z')
  `).run()
  fixture.sqlite.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, created_at, updated_at)
    VALUES ('deletion-moment', 'deletion-planet', 'deletion-track', '私人 Moment', 'private', '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')
  `).run()

  const wrongCode = code === '000000' ? '000001' : '000000'
  const invalid = await deleteAccount(makeContext(authRequest('/api/me/account', 'DELETE', cookie, {
    code: wrongCode, confirmation: 'DELETE',
  }), env()))
  expect(invalid.status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users WHERE id = ?').get(identity.userId)).toEqual({ count: 1 })

  const wrongPhrase = await deleteAccount(makeContext(authRequest('/api/me/account', 'DELETE', cookie, {
    code, confirmation: 'delete',
  }), env()))
  expect(wrongPhrase.status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users WHERE id = ?').get(identity.userId)).toEqual({ count: 1 })

  const deleted = await deleteAccount(makeContext(authRequest('/api/me/account', 'DELETE', cookie, {
    code, confirmation: 'DELETE',
  }), env()))
  expect(deleted.status).toBe(200)
  expect(await deleted.json()).toEqual({ ok: true })
  expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0')
  expect(await authenticatedMusicUser(new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: cookie } }), env())).toBeNull()
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users WHERE id = ?').get(identity.userId)).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planets WHERE owner_user_id = ?').get(identity.userId)).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_moments WHERE id = ?').get('deletion-moment')).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_email_identities WHERE user_id = ?').get(identity.userId)).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_auth_sessions WHERE user_id = ?').get(identity.userId)).toEqual({ count: 0 })
})
