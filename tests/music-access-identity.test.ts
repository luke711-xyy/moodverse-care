import { expect, beforeAll, beforeEach, afterEach, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import {
  createMusicApiEnv,
  createMusicApiFixture,
} from './helpers/music-api-fixture'

const issuer = 'https://moodverse-test.cloudflareaccess.com'
const audience = 'music-api-test-audience'
const encoder = new TextEncoder()
const encodeBase64Url = (value: string | ArrayBuffer) => Buffer.from(value).toString('base64url')

let db: ReturnType<typeof createMusicApiFixture>
let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let publicJwk: JsonWebKey

async function makeKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>
}

function defaultClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    aud: [audience],
    email: 'Luna@Example.com',
    exp: now + 300,
    iat: now,
    nbf: now - 1,
    iss: issuer,
    type: 'app',
    sub: 'access-user-1',
    ...overrides,
  }
}

async function signToken(claims: Record<string, unknown>, signingKey = privateKey) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'music-test-key' }))
  const payload = encodeBase64Url(JSON.stringify(claims))
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    signingKey,
    encoder.encode(signingInput),
  )
  return `${signingInput}.${encodeBase64Url(signature)}`
}

function installJwks() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })))
}

async function requestWith(claims?: Record<string, unknown>, signingKey = privateKey) {
  const headers = new Headers()
  if (claims) headers.set('Cf-Access-Jwt-Assertion', await signToken(claims, signingKey))
  return new Request('https://moodverse.test/api/me/music-planet', { headers })
}

async function userCount() {
  return db.sqlite.prepare('SELECT count(*) AS count FROM users').get() as { count: number }
}

beforeAll(async () => {
  const pair = await makeKeyPair()
  const otherPair = await makeKeyPair()
  privateKey = pair.privateKey
  otherPrivateKey = otherPair.privateKey
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  publicJwk = { ...jwk, kid: 'music-test-key', alg: 'RS256', use: 'sig' }
})

beforeEach(() => {
  db = createMusicApiFixture()
  installJwks()
})

afterEach(() => {
  db.close()
  vi.unstubAllGlobals()
})

test('missing, malformed, and forged assertions never create an app user', async () => {
  const env = createMusicApiEnv(db.db)
  expect(await authenticatedMusicUser(await requestWith(), env)).toBeNull()

  const malformed = new Request('https://moodverse.test', {
    headers: { 'Cf-Access-Jwt-Assertion': 'not.a.jwt' },
  })
  expect(await authenticatedMusicUser(malformed, env)).toBeNull()

  expect(await authenticatedMusicUser(await requestWith(defaultClaims(), otherPrivateKey), env)).toBeNull()
  expect(await userCount()).toEqual({ count: 0 })
})

test.each([
  ['expired', { exp: Math.floor(Date.now() / 1000) - 60 }],
  ['not yet valid', { nbf: Math.floor(Date.now() / 1000) + 600 }],
  ['wrong issuer', { iss: 'https://attacker.cloudflareaccess.com' }],
  ['wrong audience', { aud: ['another-application'] }],
  ['wrong token type', { type: 'org' }],
  ['missing email', { email: undefined }],
  ['missing subject', { sub: undefined }],
])('%s Access claims never create an app user', async (_caseName, overrides) => {
  const claims = defaultClaims(overrides)
  expect(await authenticatedMusicUser(await requestWith(claims), createMusicApiEnv(db.db))).toBeNull()
  expect(await userCount()).toEqual({ count: 0 })
})

test('verified issuer and subject map to a stable owner identity and normalized email', async () => {
  const env = createMusicApiEnv(db.db)
  const first = await authenticatedMusicUser(await requestWith(defaultClaims()), env)
  const repeat = await authenticatedMusicUser(await requestWith(defaultClaims()), env)
  const other = await authenticatedMusicUser(await requestWith(defaultClaims({ sub: 'access-user-2' })), env)

  expect(first).toMatchObject({ email: 'luna@example.com' })
  expect(first?.userId).toBe(repeat?.userId)
  expect(other?.userId).not.toBe(first?.userId)
  expect(await userCount()).toEqual({ count: 2 })
  expect(db.sqlite.prepare('SELECT count(*) AS count FROM music_access_identities').get()).toEqual({ count: 2 })
})

test('missing Cloudflare Access configuration fails closed without contacting a key URL', async () => {
  const env = createMusicApiEnv(db.db, { CF_ACCESS_TEAM_DOMAIN: '', CF_ACCESS_AUD: '' })
  const identity = await authenticatedMusicUser(await requestWith(defaultClaims()), env)

  expect(identity).toBeNull()
  expect(globalThis.fetch).not.toHaveBeenCalled()
  expect(await userCount()).toEqual({ count: 0 })
})
