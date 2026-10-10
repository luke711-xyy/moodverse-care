import type { Env } from './_shared'


const SESSION_COOKIE = 'mv_music_session'
const encoder = new TextEncoder()
const CODE_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const EMAIL_WINDOW_MS = 60 * 60 * 1000
const IP_WINDOW_MS = 60 * 60 * 1000
const EMAIL_COOLDOWN_MS = 60 * 1000
const EMAIL_SEND_LIMIT = 3
const IP_SEND_LIMIT = 10
const MAX_CODE_ATTEMPTS = 5
const EMAIL_DELIVERY_TIMEOUT_MS = 10_000

type MusicAuthRequest = { email?: unknown }
type MusicAuthVerify = { email?: unknown; code?: unknown }
type ChallengeRow = { id: string; email: string; code_hash: string; attempts: number }

const response = (body: unknown, status = 200, headers = new Headers()) => {
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  return new Response(JSON.stringify(body), { status, headers })
}

const sha256 = async (value: string) => {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const secureEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

const randomCode = () => {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1_000_000).padStart(6, '0')
}

const randomSessionToken = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `${crypto.randomUUID()}.${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}

const normalizeEmail = (value: unknown) => {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

const configured = (env: Env) => {
  const secret = env.MUSIC_AUTH_SECRET?.trim() ?? ''
  const accountId = env.MUSIC_EMAIL_ACCOUNT_ID?.trim() ?? ''
  const token = env.MUSIC_EMAIL_API_TOKEN?.trim() ?? ''
  const sender = env.MUSIC_EMAIL_FROM?.trim() ?? ''
  if (secret.length < 32 || !/^[a-f\d]{32}$/i.test(accountId) || token.length < 20 || !normalizeEmail(sender)) return null
  return { secret, accountId, token, sender }
}

export const hasSameOrigin = (request: Request) => {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  try { return new URL(origin).origin === new URL(request.url).origin } catch { return false }
}

const parseSmallBody = async <T>(request: Request) => {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(length) && length > 4096) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

const timestamp = () => new Date().toISOString()
const minusMs = (value: Date, milliseconds: number) => new Date(value.getTime() - milliseconds).toISOString()
const plusMs = (value: Date, milliseconds: number) => new Date(value.getTime() + milliseconds).toISOString()

export async function emailMusicSession(request: Request, env: Env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)mv_music_session=([^;]+)/)?.[1]
  if (!token || token.length > 256) return null
  const tokenHash = await sha256(token)
  const current = timestamp()
  return env.DB.prepare(`
    SELECT s.user_id, i.email
    FROM music_auth_sessions s
    JOIN music_email_identities i ON i.user_id = s.user_id
    WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2
    ORDER BY i.updated_at DESC, i.email
    LIMIT 1
  `).bind(tokenHash, current).first<{ user_id: string; email: string }>().then((row) => row
    ? { userId: row.user_id, email: row.email }
    : null)
}

async function sendCode(
  targetEmail: string,
  code: string,
  account: NonNullable<ReturnType<typeof configured>>,
  purpose: 'login' | 'account-deletion' = 'login',
) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/email/sending/send`
  const deleting = purpose === 'account-deletion'
  const subject = deleting ? '确认删除你的 Moodverse 账号' : '你的 Moodverse 登录验证码'
  const action = deleting ? '删除账号' : '登录'
  const text = `你的 Moodverse ${action}验证码是 ${code}，10 分钟内有效，且只能使用一次。若这不是你发起的操作，请忽略此邮件。`
  const html = `<p>你的 Moodverse ${action}验证码是：</p><p style="font-size:28px;letter-spacing:8px"><strong>${code}</strong></p><p>验证码 10 分钟内有效，且只能使用一次。若这不是你发起的操作，请忽略此邮件。</p>`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMAIL_DELIVERY_TIMEOUT_MS)
  try {
    const sent = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${account.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ to: targetEmail, from: account.sender, subject, text, html }),
      redirect: 'error',
      signal: controller.signal,
    })
    let payload: { success?: unknown; result?: { delivered?: unknown; queued?: unknown } } | null = null
    try { payload = await sent.json() as typeof payload } catch { payload = null }
    const acceptedRecipients = [
      ...(Array.isArray(payload?.result?.delivered) ? payload.result.delivered : []),
      ...(Array.isArray(payload?.result?.queued) ? payload.result.queued : []),
    ]
    return sent.ok && payload?.success === true && acceptedRecipients.some((address) => typeof address === 'string' && address.toLowerCase() === targetEmail)
  } finally {
    clearTimeout(timeout)
  }
}

export async function requestMusicAccountDeletionCode(
  request: Request,
  env: Env,
  identity: { userId: string; email: string } | null,
) {
  if (request.method !== 'POST' || !hasSameOrigin(request)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  if (!identity?.userId || !normalizeEmail(identity.email)) return response({ error: 'UNAUTHENTICATED' }, 401)
  const account = configured(env)
  if (!account) return response({ error: 'EMAIL_AUTH_NOT_CONFIGURED' }, 503)

  const email = normalizeEmail(identity.email)!
  const now = new Date()
  const nowText = now.toISOString()
  const hourAgo = minusMs(now, EMAIL_WINDOW_MS)
  const ipHourAgo = minusMs(now, IP_WINDOW_MS)
  const cooldownBoundary = minusMs(now, EMAIL_COOLDOWN_MS)
  const ip = request.headers.get('CF-Connecting-IP')?.trim().slice(0, 64) || 'unknown'
  const ipHash = await hmacHex(account.secret, `moodverse:account-deletion-ip:v1:${ip}`)
  const challengeId = crypto.randomUUID()
  const code = randomCode()
  const codeHash = await hmacHex(account.secret, `moodverse:account-deletion-otp:v1:${challengeId}:${identity.userId}:${email}:${code}`)
  const issued = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO music_account_deletion_codes
        (id, user_id, email, code_hash, request_ip_hash, attempts, created_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, ?5, 0, ?6, ?7
      WHERE (SELECT count(*) FROM music_account_deletion_codes WHERE user_id = ?2 AND created_at >= ?8) < ?10
        AND (SELECT count(*) FROM music_account_deletion_codes WHERE request_ip_hash = ?5 AND created_at >= ?9) < ?11
        AND NOT EXISTS (
          SELECT 1 FROM music_account_deletion_codes WHERE user_id = ?2 AND created_at >= ?12
        )
    `).bind(challengeId, identity.userId, email, codeHash, ipHash, nowText, plusMs(now, CODE_TTL_MS), hourAgo, ipHourAgo, EMAIL_SEND_LIMIT, IP_SEND_LIMIT, cooldownBoundary),
    env.DB.prepare(`
      UPDATE music_account_deletion_codes SET invalidated_at = ?2
      WHERE user_id = ?1 AND id <> ?3 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL
        AND EXISTS (SELECT 1 FROM music_account_deletion_codes WHERE id = ?3)
    `).bind(identity.userId, nowText, challengeId),
  ])
  if (issued[0]?.meta.changes !== 1) return response({ error: 'RATE_LIMITED' }, 429)

  try {
    const delivered = await sendCode(email, code, account, 'account-deletion')
    if (!delivered) throw new Error('CLOUDFLARE_EMAIL_NOT_ACCEPTED')
  } catch {
    await env.DB.prepare('UPDATE music_account_deletion_codes SET invalidated_at = ?2 WHERE id = ?1 AND invalidated_at IS NULL')
      .bind(challengeId, timestamp()).run()
    return response({ error: 'EMAIL_DELIVERY_UNAVAILABLE' }, 503)
  }

  return response({ ok: true })
}

export async function deleteMusicAccount(
  request: Request,
  env: Env,
  identity: { userId: string; email: string } | null,
) {
  if (request.method !== 'DELETE' || !hasSameOrigin(request)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  if (!identity?.userId || !normalizeEmail(identity.email)) return response({ error: 'UNAUTHENTICATED' }, 401)
  const body = await parseSmallBody<{ code?: unknown; confirmation?: unknown }>(request)
  if (!body || Object.keys(body).length !== 2 || body.confirmation !== 'DELETE'
    || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return response({ error: 'INVALID_DELETION_CONFIRMATION' }, 400)
  }
  const account = configured(env)
  if (!account) return response({ error: 'EMAIL_AUTH_NOT_CONFIGURED' }, 503)

  const email = normalizeEmail(identity.email)!
  const current = timestamp()
  const challenge = await env.DB.prepare(`
    SELECT id, code_hash, attempts FROM music_account_deletion_codes
    WHERE user_id = ?1 AND email = ?2 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL
      AND attempts < ?3 AND expires_at > ?4
    ORDER BY rowid DESC LIMIT 1
  `).bind(identity.userId, email, MAX_CODE_ATTEMPTS, current).first<{ id: string; code_hash: string; attempts: number }>()
  if (!challenge) return response({ error: 'INVALID_OR_EXPIRED_CODE' }, 400)

  const submittedHash = await hmacHex(account.secret, `moodverse:account-deletion-otp:v1:${challenge.id}:${identity.userId}:${email}:${body.code}`)
  if (!secureEqual(submittedHash, challenge.code_hash)) {
    const attemptedAt = timestamp()
    await env.DB.prepare(`
      UPDATE music_account_deletion_codes
      SET attempts = attempts + 1,
          locked_at = CASE WHEN attempts + 1 >= ?2 THEN ?3 ELSE locked_at END
      WHERE id = ?1 AND user_id = ?4 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL AND attempts < ?2
    `).bind(challenge.id, MAX_CODE_ATTEMPTS, attemptedAt, identity.userId).run()
    return response({ error: 'INVALID_OR_EXPIRED_CODE' }, 400)
  }

  const consumedAt = timestamp()
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE music_account_deletion_codes SET consumed_at = ?2
      WHERE id = ?1 AND user_id = ?3 AND email = ?4 AND code_hash = ?5 AND consumed_at IS NULL
        AND invalidated_at IS NULL AND locked_at IS NULL AND attempts < ?6 AND expires_at > ?7
    `).bind(challenge.id, consumedAt, identity.userId, email, challenge.code_hash, MAX_CODE_ATTEMPTS, consumedAt),
    env.DB.prepare(`
      DELETE FROM music_auth_challenges WHERE email = ?1 AND EXISTS (
        SELECT 1 FROM music_account_deletion_codes WHERE id = ?2 AND user_id = ?3 AND consumed_at = ?4
      )
    `).bind(email, challenge.id, identity.userId, consumedAt),
    env.DB.prepare(`
      DELETE FROM users WHERE id = ?1 AND EXISTS (
        SELECT 1 FROM music_account_deletion_codes WHERE id = ?2 AND user_id = ?1 AND consumed_at = ?3
      )
    `).bind(identity.userId, challenge.id, consumedAt),
  ])
  if (results[0]?.meta.changes !== 1 || results[2]?.meta.changes !== 1) {
    return response({ error: 'INVALID_OR_EXPIRED_CODE' }, 400)
  }

  const headers = new Headers()
  headers.set('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
  return response({ ok: true }, 200, headers)
}

export async function requestMusicEmailCode(request: Request, env: Env) {
  if (request.method !== 'POST' || !hasSameOrigin(request)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  const body = await parseSmallBody<MusicAuthRequest>(request)
  const email = normalizeEmail(body?.email)
  if (!email) return response({ error: 'INVALID_EMAIL' }, 400)
  const account = configured(env)
  if (!account) return response({ error: 'EMAIL_AUTH_NOT_CONFIGURED' }, 503)

  const now = new Date()
  const nowText = now.toISOString()
  const hourAgo = minusMs(now, EMAIL_WINDOW_MS)
  const ipHourAgo = minusMs(now, IP_WINDOW_MS)
  const cooldownBoundary = minusMs(now, EMAIL_COOLDOWN_MS)
  const ip = request.headers.get('CF-Connecting-IP')?.trim().slice(0, 64) || 'unknown'
  const ipHash = await hmacHex(account.secret, `moodverse:auth-ip:v1:${ip}`)
  const [emailCount, ipCount, recentlySent] = await Promise.all([
    env.DB.prepare('SELECT count(*) AS count FROM music_auth_challenges WHERE email = ?1 AND created_at >= ?2').bind(email, hourAgo).first<{ count: number }>(),
    env.DB.prepare('SELECT count(*) AS count FROM music_auth_challenges WHERE request_ip_hash = ?1 AND created_at >= ?2').bind(ipHash, ipHourAgo).first<{ count: number }>(),
    env.DB.prepare('SELECT id FROM music_auth_challenges WHERE email = ?1 AND created_at >= ?2 LIMIT 1').bind(email, cooldownBoundary).first<{ id: string }>(),
  ])
  if ((emailCount?.count ?? 0) >= EMAIL_SEND_LIMIT || (ipCount?.count ?? 0) >= IP_SEND_LIMIT || recentlySent) {
    return response({ error: 'RATE_LIMITED' }, 429)
  }

  const challengeId = crypto.randomUUID()
  const code = randomCode()
  const codeHash = await hmacHex(account.secret, `moodverse:email-otp:v1:${challengeId}:${email}:${code}`)
  const expiry = plusMs(now, CODE_TTL_MS)
  const issuance = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO music_auth_challenges (id, email, code_hash, request_ip_hash, attempts, created_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, 0, ?5, ?6
      WHERE (SELECT count(*) FROM music_auth_challenges WHERE email = ?2 AND created_at >= ?7) < ?9
        AND (SELECT count(*) FROM music_auth_challenges WHERE request_ip_hash = ?4 AND created_at >= ?11) < ?10
        AND NOT EXISTS (
          SELECT 1 FROM music_auth_challenges WHERE email = ?2 AND created_at >= ?8
        )
    `).bind(challengeId, email, codeHash, ipHash, nowText, expiry, hourAgo, cooldownBoundary, EMAIL_SEND_LIMIT, IP_SEND_LIMIT, ipHourAgo),
    env.DB.prepare(`
      UPDATE music_auth_challenges SET invalidated_at = ?2
      WHERE email = ?1 AND id <> ?3 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL
        AND EXISTS (SELECT 1 FROM music_auth_challenges WHERE id = ?3)
    `).bind(email, nowText, challengeId),
  ])
  if (issuance[0]?.meta.changes !== 1) return response({ error: 'RATE_LIMITED' }, 429)

  try {
    const delivered = await sendCode(email, code, account)
    if (!delivered) throw new Error('CLOUDFLARE_EMAIL_NOT_ACCEPTED')
  } catch {
    await env.DB.prepare('UPDATE music_auth_challenges SET invalidated_at = ?2 WHERE id = ?1 AND invalidated_at IS NULL')
      .bind(challengeId, timestamp()).run()
    return response({ error: 'EMAIL_DELIVERY_UNAVAILABLE' }, 503)
  }

  // No account lookup occurs here: a valid email gets the same response for an
  // existing user and a new signup, so this endpoint cannot enumerate users.
  return response({ ok: true })
}

const invalidCode = () => response({ error: 'INVALID_OR_EXPIRED_CODE' }, 400)

export async function verifyMusicEmailCode(request: Request, env: Env) {
  if (request.method !== 'POST' || !hasSameOrigin(request)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  const body = await parseSmallBody<MusicAuthVerify>(request)
  const email = normalizeEmail(body?.email)
  if (!email || typeof body?.code !== 'string' || !/^\d{6}$/.test(body.code)) return invalidCode()
  const account = configured(env)
  if (!account) return response({ error: 'EMAIL_AUTH_NOT_CONFIGURED' }, 503)

  const current = timestamp()
  const challenge = await env.DB.prepare(`
    SELECT id, email, code_hash, attempts FROM music_auth_challenges
    WHERE email = ?1 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL
      AND attempts < ?2 AND expires_at > ?3
    ORDER BY rowid DESC LIMIT 1
  `).bind(email, MAX_CODE_ATTEMPTS, current).first<ChallengeRow>()
  if (!challenge) return invalidCode()

  const submittedHash = await hmacHex(account.secret, `moodverse:email-otp:v1:${challenge.id}:${email}:${body.code}`)
  if (!secureEqual(submittedHash, challenge.code_hash)) {
    const attemptedAt = timestamp()
    await env.DB.prepare(`
      UPDATE music_auth_challenges
      SET attempts = attempts + 1,
          locked_at = CASE WHEN attempts + 1 >= ?2 THEN ?3 ELSE locked_at END
      WHERE id = ?1 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL AND attempts < ?2
    `).bind(challenge.id, MAX_CODE_ATTEMPTS, attemptedAt).run()
    return invalidCode()
  }

  const existingIdentity = await env.DB.prepare('SELECT user_id FROM music_email_identities WHERE email = ?1')
    .bind(email).first<{ user_id: string }>()
  let userId = existingIdentity?.user_id ?? ''
  if (!userId) {
    const accessMatches = await env.DB.prepare(`
      SELECT DISTINCT user_id FROM music_access_identities WHERE lower(trim(email)) = ?1 LIMIT 2
    `).bind(email).all<{ user_id: string }>()
    if (accessMatches.results.length > 1) return response({ error: 'EMAIL_IDENTITY_CONFLICT' }, 409)
    userId = accessMatches.results[0]?.user_id ?? crypto.randomUUID()
  }

  const token = randomSessionToken()
  const tokenHash = await sha256(token)
  const placeholderTokenHash = await sha256(`music-email-placeholder:${crypto.randomUUID()}`)
  const sessionId = crypto.randomUUID()
  const consumedAt = timestamp()
  const expiresAt = plusMs(new Date(consumedAt), SESSION_TTL_MS)
  const createdAt = timestamp()
  const batchResults = await env.DB.batch([
    env.DB.prepare(`
      UPDATE music_auth_challenges SET consumed_at = ?2, consumed_nonce = ?3
      WHERE id = ?1 AND consumed_at IS NULL AND invalidated_at IS NULL AND locked_at IS NULL
        AND attempts < ?4 AND expires_at > ?2
    `).bind(challenge.id, consumedAt, sessionId, MAX_CODE_ATTEMPTS),
    env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, token_hash, created_at, updated_at)
      SELECT ?1, ?2, ?3, ?3 WHERE EXISTS (
        SELECT 1 FROM music_auth_challenges WHERE id = ?4 AND consumed_nonce = ?5
      )
    `).bind(userId, placeholderTokenHash, createdAt, challenge.id, sessionId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO music_email_identities (user_id, email, created_at, updated_at)
      SELECT ?1, ?2, ?3, ?3 WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ?1
      ) AND EXISTS (
        SELECT 1 FROM music_auth_challenges WHERE id = ?4 AND consumed_nonce = ?5
      )
    `).bind(userId, email, createdAt, challenge.id, sessionId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO music_auth_sessions (token_hash, user_id, created_at, expires_at)
      SELECT ?1, user_id, ?2, ?3 FROM music_email_identities
      WHERE email = ?4 AND EXISTS (
        SELECT 1 FROM music_auth_challenges WHERE id = ?5 AND consumed_nonce = ?6
      )
    `).bind(tokenHash, createdAt, expiresAt, email, challenge.id, sessionId),
  ])
  if (batchResults[0]?.meta.changes !== 1) return invalidCode()

  const sessionRow = await env.DB.prepare(`
    SELECT s.user_id, i.email FROM music_auth_sessions s
    JOIN music_email_identities i ON i.user_id = s.user_id
    WHERE s.token_hash = ?1 AND s.revoked_at IS NULL
    ORDER BY i.updated_at DESC, i.email LIMIT 1
  `).bind(tokenHash).first<{ user_id: string; email: string }>()
  if (!sessionRow) return invalidCode()
  const headers = new Headers()
  headers.set('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`)
  return response({ authenticated: true, email: sessionRow.email }, 200, headers)
}

export async function logoutMusicSession(request: Request, env: Env) {
  if (request.method !== 'POST' || !hasSameOrigin(request)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403)
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)mv_music_session=([^;]+)/)?.[1]
  if (token && token.length <= 256) {
    await env.DB.prepare('UPDATE music_auth_sessions SET revoked_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL')
      .bind(await sha256(token), timestamp()).run()
  }
  const headers = new Headers()
  headers.set('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
  return response({ ok: true }, 200, headers)
}
