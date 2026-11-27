import { createServer } from 'node:http'
import { createPublicKey, createHash, randomBytes, verify } from 'node:crypto'

const issuer = 'https://auth.openai.com'
const resource = 'https://api.openai.com/v1'
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const required = 'chatgpt.tokens.use.direct'
const registration = 'dynamic_agent_client'
const random = () => randomBytes(32).toString('base64url')
const hasGrant = (value) => typeof value === 'string' && value.split(/\s+/).includes(required)
const validText = (value) => typeof value === 'string' && value.trim().length > 0
const validClientId = (value) =>
  validText(value) && value.length <= 255 && value !== registration && !Object.hasOwn(Object.prototype, value)
const invalidIdentity = () => new Error('ChatGPT 身份验证失败。')

async function contact(net, url, init) {
  try {
    return await net(url, init)
  } catch {
    throw new Error('无法连接 ChatGPT 授权服务，请检查网络后重试。')
  }
}
async function metadata(net) {
  const res = await contact(net, issuer + '/.well-known/openid-configuration', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  })
  if (!res.ok) throw new Error('无法获取 ChatGPT 授权配置。')
  const meta = await res.json()
  if (meta.issuer !== issuer) throw new Error('授权服务身份校验失败。')
  return meta
}
function trustedEndpoint(value) {
  const url = new URL(value)
  if (url.origin !== issuer || url.username || url.password || url.hash) throw new Error('授权服务地址无效。')
  return url.href
}
async function exchange(params, net) {
  const response = await contact(net, issuer + '/api/accounts/oauth/token', {
    method: 'POST',
    body: new URLSearchParams(params),
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`授权未完成（${response.status}）。请重新连接 ChatGPT。`)
  const token = await response.json()
  if (
    !validText(token?.access_token) ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    (token.token_type !== undefined && String(token.token_type).toLowerCase() !== 'bearer') ||
    (token.client_id !== undefined && token.client_id !== params.client_id)
  )
    throw new Error('服务返回的授权凭证无效。')
  return token
}
export function authorizeURL({ saved, host, callback, state, nonce, verifier }) {
  const url = new URL(issuer + '/api/accounts/authorize')
  url.search = new URLSearchParams({
    client_id: saved?.clientId ?? registration,
    ext_agent_host_id: host,
    ...(saved ? (saved.idToken ? { id_token_hint: saved.idToken } : {}) : { agent_name_hint: 'MOSIC Copilot' }),
    response_type: 'code',
    redirect_uri: callback,
    resource,
    scope: scopes,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString()
  return url.href
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
export async function validateIdentity(token, clientId, nonce, net, refreshed = false) {
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3 || parts.some((p) => !/^[a-zA-Z0-9_-]+$/.test(p))) throw invalidIdentity()
  let header, claims
  try {
    header = decode(parts[0])
    claims = decode(parts[1])
  } catch {
    throw invalidIdentity()
  }
  if (!claims || header?.alg !== 'RS256' || !validText(header.kid)) throw invalidIdentity()
  const config = await metadata(net)
  const resp = await contact(net, trustedEndpoint(config.jwks_uri), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error('无法获取身份验证公钥。')
  const { keys } = await resp.json()
  const key =
    Array.isArray(keys) &&
    keys.find(
      (k) =>
        k?.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === header.alg),
    )
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  const now = Date.now() / 1000
  // An ID token returned by a refresh may omit the nonce. If supplied, it must
  // still match the nonce bound to the original verified authorization.
  if (
    !key ||
    !verify(
      'RSA-SHA256',
      Buffer.from(parts.slice(0, 2).join('.')),
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    ) ||
    claims.iss !== issuer ||
    !aud.includes(clientId) ||
    ((aud.length > 1 || claims.azp !== undefined) && claims.azp !== clientId) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || now < claims.nbf)) ||
    ((!refreshed || claims.nonce !== undefined) && (!nonce || claims.nonce !== nonce)) ||
    !validText(claims.sub)
  )
    throw invalidIdentity()
  return { subject: claims.sub, label: validText(claims.email) ? claims.email : 'ChatGPT' }
}

export async function signIn(host, saved, openBrowser, net = fetch, { timeoutMs = 180000 } = {}) {
  if (saved && !validClientId(saved.clientId)) throw new Error('已保存的账号注册无效。')
  const verifier = random(),
    state = random(),
    nonce = random()
  let resolveCode, rejectCode
  const result = new Promise((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  const server = createServer((req, res) => {
    let url
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1')
    } catch {
      res.writeHead(400).end()
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' || url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
      res.writeHead(400).end()
      return
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('可以返回 MOSIC 副驾查看连接结果。')
    const issued = url.searchParams.get('client_id') ?? saved?.clientId
    const code = url.searchParams.get('code')
    if (
      url.searchParams.has('error') ||
      !validText(code) ||
      !validClientId(issued) ||
      (saved && saved.clientId !== issued)
    ) {
      rejectCode(new Error('连接已取消或客户端身份不匹配。'))
      return
    }
    resolveCode({ clientId: issued, code })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('登录请求已过期。')), timeoutMs)
  })
  try {
    const callback = 'http://127.0.0.1:' + server.address().port + '/auth/callback'
    const url = authorizeURL({ saved, host, callback, state, nonce, verifier })
    // A fast browser callback may arrive before openExternal itself resolves.
    // Subscribe to both outcomes immediately, including cancellation and timeout.
    const [{ code, clientId }] = await Promise.race([
      Promise.all([result, Promise.resolve().then(() => openBrowser(url))]),
      deadline,
    ])
    const tokens = await exchange(
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: callback,
        code,
        code_verifier: verifier,
        resource,
      },
      net,
    )
    const identity = await validateIdentity(tokens.id_token, clientId, nonce, net)
    if ((saved && saved.subject !== identity.subject) || !hasGrant(tokens.scope) || !validText(tokens.refresh_token))
      throw new Error('未取得此账号的套餐推理授权。')
    return {
      clientId,
      ...identity,
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      idToken: tokens.id_token,
      nonce,
      scope: tokens.scope,
      expires: Date.now() + tokens.expires_in * 1000,
    }
  } finally {
    clearTimeout(timer)
    server.close()
    server.closeIdleConnections()
  }
}
export async function refresh(account, net = fetch) {
  const t = await exchange(
    { grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refresh, resource },
    net,
  )
  if (t.scope !== undefined && !hasGrant(t.scope)) throw new Error('需要重新授权 ChatGPT 套餐。')
  if (t.refresh_token !== undefined && !validText(t.refresh_token)) throw new Error('服务返回的续授权凭证无效。')
  if (t.id_token !== undefined) {
    const identity = await validateIdentity(t.id_token, account.clientId, account.nonce, net, true)
    if (identity.subject !== account.subject) throw invalidIdentity()
  }
  return {
    ...account,
    access: t.access_token,
    refresh: t.refresh_token ?? account.refresh,
    idToken: t.id_token ?? account.idToken,
    scope: t.scope ?? account.scope,
    expires: Date.now() + t.expires_in * 1000,
  }
}
export async function revoke(account, net = fetch) {
  const meta = await metadata(net)
  const res = await contact(net, trustedEndpoint(meta.revocation_endpoint), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      client_id: account.clientId,
      token: account.refresh,
      token_type_hint: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('本机已断开，远程撤销尚未确认。可在 ChatGPT 设置中断开。')
}
