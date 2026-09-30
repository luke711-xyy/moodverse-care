import { emailMusicSession } from './_music-email-auth'

export type Env = {
  DB: D1Database
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  MUSIC_ALLOW_LEGACY_ACCESS_AUTH?: string
  MUSIC_AUTH_SECRET?: string
  MUSIC_EMAIL_ACCOUNT_ID?: string
  MUSIC_EMAIL_API_TOKEN?: string
  MUSIC_EMAIL_FROM?: string
  MUSIC_DEMO_EMAIL?: string
  MUSIC_AI_GATEWAY_URL?: string
  MUSIC_AI_SONG_PORTAL_URL?: string
  MUSIC_AI_EMBEDDING_URL?: string
  MUSIC_AI_ACCESS_CLIENT_ID?: string
  MUSIC_AI_ACCESS_CLIENT_SECRET?: string
  MUSIC_AI_GATEWAY_TOKEN?: string
}

const COOKIE = 'mv_session'

const now = () => new Date().toISOString()

const randomToken = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `${crypto.randomUUID()}.${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}

const sha256 = async (value: string) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type AccessJwk = JsonWebKey & { kid?: string; alg?: string; use?: string }
type AccessClaims = {
  aud?: string | string[]
  email?: unknown
  exp?: unknown
  nbf?: unknown
  iss?: unknown
  sub?: unknown
  type?: unknown
}

const ACCESS_JWKS_TTL_MS = 5 * 60 * 1000
const accessJwksCache = new Map<string, { fetchedAt: number; keys: AccessJwk[] }>()
const encoder = new TextEncoder()

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const decodeJsonSegment = <T>(value: string): T => {
  const bytes = decodeBase64Url(value)
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

const configuredAccessIssuer = (value: string | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com')) return null
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

async function accessSigningKey(issuer: string, kid: string): Promise<CryptoKey | null> {
  const cached = accessJwksCache.get(issuer)
  let jwk = cached?.keys.find((key) => key.kid === kid)
  const cacheIsFresh = !!cached && Date.now() - cached.fetchedAt < ACCESS_JWKS_TTL_MS

  if (!jwk || !cacheIsFresh) {
    const response = await fetch(new URL('/cdn-cgi/access/certs', issuer), {
      headers: { accept: 'application/json' },
      redirect: 'error',
    })
    if (!response.ok) return null
    const data = await response.json() as { keys?: AccessJwk[] }
    if (!Array.isArray(data.keys)) return null
    const keys = data.keys.filter((key) => key && typeof key.kid === 'string' && key.kty === 'RSA')
    accessJwksCache.set(issuer, { fetchedAt: Date.now(), keys })
    jwk = keys.find((key) => key.kid === kid)
  }

  if (!jwk || (jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig')) return null
  return crypto.subtle.importKey('jwk', jwk, {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256',
  }, false, ['verify'])
}

async function verifiedAccessClaims(request: Request, env: Env): Promise<{ issuer: string; claims: AccessClaims } | null> {
  const issuer = configuredAccessIssuer(env.CF_ACCESS_TEAM_DOMAIN)
  const audience = env.CF_ACCESS_AUD?.trim()
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!issuer || !audience || !token || token.length > 12_000) return null

  try {
    const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.')
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) return null

    const header = decodeJsonSegment<{ alg?: unknown; kid?: unknown }>(encodedHeader)
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null

    const key = await accessSigningKey(issuer, header.kid)
    if (!key) return null
    const validSignature = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    )
    if (!validSignature) return null

    const claims = decodeJsonSegment<AccessClaims>(encodedPayload)
    const currentTime = Math.floor(Date.now() / 1000)
    const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud
    if (claims.iss !== issuer || !Array.isArray(audiences) || !audiences.includes(audience)) return null
    if (claims.type !== 'app' || typeof claims.exp !== 'number' || currentTime >= claims.exp) return null
    if (typeof claims.nbf !== 'number' || currentTime < claims.nbf) return null
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) return null
    if (typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email.trim())) return null

    return { issuer, claims }
  } catch {
    return null
  }
}

/** Resolve app-issued email sessions; legacy Access auth is disabled unless explicitly opted in. */
export async function authenticatedMusicUser(request: Request, env: Env) {
  const emailIdentity = await emailMusicSession(request, env)
  if (emailIdentity) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) && !hasSameOrigin(request)) return null
    return emailIdentity
  }

  if (env.MUSIC_ALLOW_LEGACY_ACCESS_AUTH?.trim() !== 'true') return null

  const identity = await verifiedAccessClaims(request, env)
  if (!identity || typeof identity.claims.sub !== 'string' || typeof identity.claims.email !== 'string') return null

  const subject = identity.claims.sub.trim()
  const email = identity.claims.email.trim().toLowerCase()
  const userId = `cf_${await sha256(`${identity.issuer}\u0000${subject}`)}`
  const createdAt = now()
  // `token_hash` belongs to the pre-Access anonymous session scheme. Store a
  // random hash with no corresponding issued cookie so new identities do not
  // accidentally become legacy sessions.
  const unusedTokenHash = await sha256(`music-access-placeholder:${crypto.randomUUID()}`)

  await env.DB.prepare(`
    INSERT OR IGNORE INTO users (id, token_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?3)
  `).bind(userId, unusedTokenHash, createdAt).run()

  await env.DB.prepare(`
    INSERT INTO music_access_identities
      (user_id, access_issuer, access_subject, email, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?5)
    ON CONFLICT(access_issuer, access_subject)
    DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at
  `).bind(userId, identity.issuer, subject, email, createdAt).run()

  const mapped = await env.DB.prepare(`
    SELECT user_id FROM music_access_identities
    WHERE access_issuer = ?1 AND access_subject = ?2
  `).bind(identity.issuer, subject).first<{ user_id: string }>()
  if (!mapped?.user_id) return null
  return { userId: mapped.user_id, email }
}

function hasSameOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  try { return new URL(origin).origin === new URL(request.url).origin } catch { return false }
}

export async function session(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1]
  if (!cookie) return createSession(env)
  const tokenHash = await sha256(cookie)
  const user = await env.DB.prepare('SELECT id FROM users WHERE token_hash = ?1').bind(tokenHash).first<{ id: string }>()
  if (!user) return createSession(env)
  return { userId: user.id, token: cookie, setCookie: null as string | null }
}

async function createSession(env: Env) {
  const token = randomToken()
  const userId = crypto.randomUUID()
  const tokenHash = await sha256(token)
  const timestamp = now()
  await env.DB.prepare('INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)').bind(userId, tokenHash, timestamp).run()
  return { userId, token, setCookie: `${COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` }
}

export const withCookie = (body: unknown, sessionInfo: { setCookie: string | null }, status = 200) => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  if (sessionInfo.setCookie) headers.set('set-cookie', sessionInfo.setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

export const json = async <T>(request: Request) => {
  try { return await request.json() as T } catch { return null }
}

export const safeHttpsUrl = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

export const safeList = (value: unknown, limit: number) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, limit) : []
export const safeText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
