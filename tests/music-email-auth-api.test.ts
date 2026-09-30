import { afterEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestPost as requestEmailCode } from '../functions/api/auth/email/request'
import { onRequestPost as verifyEmailCode } from '../functions/api/auth/email/verify'
import { onRequestPost as logout } from '../functions/api/auth/logout'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture } from './helpers/music-api-fixture'

const makeContext = (request: Request, env: Env) => ({ request, env, waitUntil: vi.fn() }) as unknown as PagesFunctionEvent<Env>
const authEnv = (database: D1Database, overrides: Partial<Env> = {}) => createMusicApiEnv(database, {
  MUSIC_AUTH_SECRET: 'local-test-secret-with-at-least-32-characters',
  MUSIC_EMAIL_FROM: 'login@moodverse.example',
  MUSIC_EMAIL_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  MUSIC_EMAIL_API_TOKEN: 'cf-email-api-token-for-tests-000000',
  ...overrides,
})

function installEmailApi() {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    const payload = typeof init?.body === 'string' ? JSON.parse(init.body) as { to?: string } : {}
    return Response.json({ success: true, errors: [], result: { delivered: [payload.to] } })
  }))
  return requests
}

const requestCode = (env: Env, email: unknown, ip = '203.0.113.9') => requestEmailCode(makeContext(
  new Request('https://moodverse.test/api/auth/email/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://moodverse.test' },
    body: JSON.stringify({ email }),
  }), env,
))

const verifyCode = (env: Env, email: unknown, code: unknown) => verifyEmailCode(makeContext(
  new Request('https://moodverse.test/api/auth/email/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: 'https://moodverse.test' },
    body: JSON.stringify({ email, code }),
  }), env,
))

function lastSentCode(env: Env) {
  void env
  const requests = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[RequestInfo | URL, RequestInit?]>
  const body = requests.at(-1)?.[1]?.body
  const message = typeof body === 'string' ? JSON.parse(body) as { text?: string } : undefined
  const code = message?.text.match(/\b(\d{6})\b/)?.[1]
  if (!code) throw new Error('OTP was not included in the test email')
  return code
}

const cookieValue = (response: Response) => response.headers.get('set-cookie')?.match(/mv_music_session=([^;]+)/)?.[1] ?? ''

let fixture: ReturnType<typeof createMusicApiFixture>
afterEach(() => {
  fixture?.close()
  vi.unstubAllGlobals()
})

test('sends a generic success for normalized email and stores only a keyed OTP digest', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  const requests = installEmailApi()
  const response = await requestCode(env, ' Luna@Example.com ')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(requests[0]?.url).toBe('https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/email/sending/send')
  expect(requests[0]?.init?.headers).toMatchObject({ authorization: 'Bearer cf-email-api-token-for-tests-000000' })
  expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
    to: 'luna@example.com', from: 'login@moodverse.example', subject: '你的 Moodverse 登录验证码',
  })
  const code = lastSentCode(env)
  const challenge = fixture.sqlite.prepare('SELECT email, code_hash, attempts, expires_at FROM music_auth_challenges').get() as {
    email: string; code_hash: string; attempts: number; expires_at: string
  }
  expect(challenge.email).toBe('luna@example.com')
  expect(challenge.code_hash).not.toContain(code)
  expect(challenge.code_hash).toMatch(/^[a-f0-9]{64}$/)
  expect(challenge.attempts).toBe(0)
  expect(Date.parse(challenge.expires_at)).toBeGreaterThan(Date.now())
})

test('rejects malformed email and missing sending configuration without storing an OTP', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  expect((await requestCode(env, 'not-an-email')).status).toBe(400)
  const unavailable = authEnv(fixture.db, { MUSIC_EMAIL_API_TOKEN: '' })
  expect((await requestCode(unavailable, 'luna@example.com')).status).toBe(503)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_auth_challenges').get()).toEqual({ count: 0 })
})

test('rejects oversized JSON bodies even when Content-Length is not provided', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  const oversized = await requestEmailCode(makeContext(new Request('https://moodverse.test/api/auth/email/request', {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://moodverse.test' },
    body: JSON.stringify({ email: `${'a'.repeat(5000)}@example.com` }),
  }), env))
  expect(oversized.status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_auth_challenges').get()).toEqual({ count: 0 })
})

test('refuses cross-origin auth actions and invalidates a challenge when Cloudflare rejects its email', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false, errors: [{ code: 'E_SENDER_NOT_VERIFIED' }] }, { status: 400 })))
  const forgedOrigin = await requestEmailCode(makeContext(new Request('https://moodverse.test/api/auth/email/request', {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ email: 'luna@example.com' }),
  }), env))
  expect(forgedOrigin.status).toBe(403)
  expect((await requestCode(env, 'luna@example.com')).status).toBe(503)
  expect(fixture.sqlite.prepare('SELECT invalidated_at FROM music_auth_challenges').get()).toMatchObject({ invalidated_at: expect.any(String) })
})

test('wrong codes consume an attempt; a valid code is one-use and authorizes a secure cookie session', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  await requestCode(env, 'luna@example.com')
  const code = lastSentCode(env)
  const wrong = await verifyCode(env, 'luna@example.com', code === '000000' ? '000001' : '000000')
  expect(wrong.status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT attempts FROM music_auth_challenges').get()).toEqual({ attempts: 1 })

  const verified = await verifyCode(env, ' LUNA@example.com ', code)
  expect(verified.status).toBe(200)
  expect(await verified.json()).toMatchObject({ authenticated: true, email: 'luna@example.com' })
  const cookie = verified.headers.get('set-cookie') ?? ''
  expect(cookie).toContain('mv_music_session=')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('Secure')
  expect(cookie).toContain('SameSite=Lax')
  expect(cookie).toContain('Max-Age=2592000')

  const apiRequest = new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: cookie.split(';')[0] } })
  const identity = await authenticatedMusicUser(apiRequest, env)
  expect(identity).toMatchObject({ userId: expect.any(String), email: 'luna@example.com' })
  const sameOriginWrite = new Request('https://moodverse.test/api/me/music-planet/moments', {
    method: 'POST', headers: { Cookie: cookie.split(';')[0], Origin: 'https://moodverse.test' },
  })
  expect(await authenticatedMusicUser(sameOriginWrite, env)).toMatchObject({ userId: identity?.userId })
  expect((await verifyCode(env, 'luna@example.com', code)).status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT consumed_at FROM music_auth_challenges').get()).toMatchObject({ consumed_at: expect.any(String) })
})

test('Cloudflare Access PIN assertions are not a public music sign-in unless legacy auth is explicitly enabled', async () => {
  fixture = createMusicApiFixture()
  const issuer = 'https://legacy-access-test.cloudflareaccess.com'
  const audience = 'legacy-access-test-audience'
  const authority = await createAccessTestAuthority(issuer, audience)
  authority.installJwks()
  const accessRequest = await authority.request({ email: 'legacy@example.com', sub: 'legacy-subject' })
  const env = createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    MUSIC_ALLOW_LEGACY_ACCESS_AUTH: undefined,
  })

  await expect(authenticatedMusicUser(accessRequest, env)).resolves.toBeNull()
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_access_identities').get()).toEqual({ count: 0 })
})

test('expires codes and invalidates an earlier code when a replacement is sent', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  await requestCode(env, 'luna@example.com')
  const first = lastSentCode(env)
  fixture.sqlite.prepare("UPDATE music_auth_challenges SET created_at = '2000-01-01T00:00:00.000Z'").run()
  await requestCode(env, 'luna@example.com')
  const second = lastSentCode(env)
  expect(second).not.toBe(first)
  expect(fixture.sqlite.prepare('SELECT invalidated_at FROM music_auth_challenges ORDER BY created_at').all()).toEqual([
    { invalidated_at: expect.any(String) },
    { invalidated_at: null },
  ])
  expect((await verifyCode(env, 'luna@example.com', first)).status).toBe(400)

  fixture.sqlite.prepare("UPDATE music_auth_challenges SET expires_at = '2000-01-01T00:00:00.000Z' WHERE invalidated_at IS NULL").run()
  expect((await verifyCode(env, 'luna@example.com', second)).status).toBe(400)
})

test('locks a code after five wrong attempts and does not permit a later correct submission', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  await requestCode(env, 'luna@example.com')
  const correct = lastSentCode(env)
  const wrong = correct === '000000' ? '000001' : '000000'
  for (let attempt = 0; attempt < 5; attempt += 1) expect((await verifyCode(env, 'luna@example.com', wrong)).status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT attempts, locked_at FROM music_auth_challenges').get()).toMatchObject({
    attempts: 5, locked_at: expect.any(String),
  })
  expect((await verifyCode(env, 'luna@example.com', correct)).status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_auth_sessions').get()).toEqual({ count: 0 })
})

test('limits code requests by normalized email and source IP', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  for (let index = 0; index < 3; index += 1) {
    expect((await requestCode(env, 'luna@example.com')).status).toBe(200)
    fixture.sqlite.prepare("UPDATE music_auth_challenges SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes')").run()
  }
  expect((await requestCode(env, 'luna@example.com')).status).toBe(429)

  for (let index = 0; index < 10; index += 1) {
    expect((await requestCode(env, `person-${index}@example.com`, '203.0.113.77')).status).toBe(200)
  }
  expect((await requestCode(env, 'person-last@example.com', '203.0.113.77')).status).toBe(429)
})

test('email verification reuses a uniquely matching verified Access account and logout revokes its session', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  fixture.sqlite.prepare(`
    INSERT INTO users (id, token_hash, created_at, updated_at)
    VALUES ('existing-owner', 'unused-legacy-hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run()
  fixture.sqlite.prepare(`
    INSERT INTO music_access_identities (user_id, access_issuer, access_subject, email, created_at, updated_at)
    VALUES ('existing-owner', 'https://old.cloudflareaccess.com', 'subject-1', 'Luna@Example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run()
  await requestCode(env, 'luna@example.com')
  const verified = await verifyCode(env, 'luna@example.com', lastSentCode(env))
  const sessionCookie = verified.headers.get('set-cookie')?.split(';')[0] ?? ''
  const identity = await authenticatedMusicUser(new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: sessionCookie } }), env)
  expect(identity?.userId).toBe('existing-owner')

  const loggedOut = await logout(makeContext(new Request('https://moodverse.test/api/auth/logout', {
    method: 'POST', headers: { Cookie: sessionCookie, Origin: 'https://moodverse.test' },
  }), env))
  expect(loggedOut.status).toBe(200)
  expect(loggedOut.headers.get('set-cookie')).toContain('Max-Age=0')
  expect(await authenticatedMusicUser(new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: sessionCookie } }), env)).toBeNull()
})

test('does not authorize expired email sessions or writes missing a same-origin check', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  await requestCode(env, 'luna@example.com')
  const verified = await verifyCode(env, 'luna@example.com', lastSentCode(env))
  const sessionCookie = verified.headers.get('set-cookie')?.split(';')[0] ?? ''
  const protectedWrite = new Request('https://moodverse.test/api/me/music-planet/moments', {
    method: 'POST', headers: { Cookie: sessionCookie, 'content-type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({}),
  })
  expect(await authenticatedMusicUser(protectedWrite, env)).toBeNull()
  fixture.sqlite.prepare("UPDATE music_auth_sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run()
  const read = new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: sessionCookie } })
  expect(await authenticatedMusicUser(read, env)).toBeNull()
})

test('refuses to merge a verified email that maps to multiple existing Access accounts', async () => {
  fixture = createMusicApiFixture()
  const env = authEnv(fixture.db)
  installEmailApi()
  for (const [id, subject] of [['owner-1', 'subject-1'], ['owner-2', 'subject-2']]) {
    fixture.sqlite.prepare('INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, `hash-${id}`, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    fixture.sqlite.prepare(`
      INSERT INTO music_access_identities (user_id, access_issuer, access_subject, email, created_at, updated_at)
      VALUES (?, 'https://old.cloudflareaccess.com', ?, 'luna@example.com', ?, ?)
    `).run(id, subject, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  }
  await requestCode(env, 'luna@example.com')
  const verified = await verifyCode(env, 'luna@example.com', lastSentCode(env))
  expect(verified.status).toBe(409)
  expect(await verified.json()).toEqual({ error: 'EMAIL_IDENTITY_CONFLICT' })
  expect(fixture.sqlite.prepare('SELECT consumed_at FROM music_auth_challenges').get()).toEqual({ consumed_at: null })
})
