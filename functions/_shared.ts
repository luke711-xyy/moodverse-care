export type Env = { DB: D1Database }

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

export const safeList = (value: unknown, limit: number) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, limit) : []
export const safeText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
