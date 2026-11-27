import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { signIn, refresh, revoke } from '../src/login.mjs'

const issuer = 'https://auth.openai.com'
const resource = 'https://api.openai.com/v1'
const grant = 'openid email resource.invoke chatgpt.tokens.use.direct'
const hostId = 'urn:uuid:50d5919a-1286-4be9-b043-da4d3637f2cd'
const issuedId = 'oaiapp_test_registration'
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-signing-key', alg: 'RS256', use: 'sig' }
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

function signedIdentity(claims, signingKey = privateKey) {
  const payload =
    encode({ alg: 'RS256', kid: jwk.kid }) +
    '.' +
    encode({
      iss: issuer,
      aud: issuedId,
      sub: 'test-account',
      email: 'reader@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
  return payload + '.' + sign('RSA-SHA256', Buffer.from(payload), signingKey).toString('base64url')
}

// Only the simulated issuer requests are rewritten. Production endpoints and
// JWT issuer/audience checks receive exactly the URLs used by the real flow.
async function harness(t) {
  const h = {
    grants: grant,
    claims: {},
    refreshClaims: null,
    refreshPayload: {},
    registrations: [],
    exchanges: [],
    revoked: [],
    callback: {},
    expectedClient: issuedId,
    nonce: '',
    availability: {},
    afterOpen: undefined,
  }
  const server = createServer(async (req, res) => {
    try {
      const path = req.url
      const url = new URL(path, 'http://127.0.0.1')
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
      const json = (status, body) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      if (h.availability[path]) return json(h.availability[path], {})
      if (path === '/.well-known/openid-configuration')
        return json(200, { issuer, jwks_uri: issuer + '/keys', revocation_endpoint: issuer + '/revoke' })
      if (path === '/keys') return json(200, { keys: [jwk] })
      if (path === '/revoke' && req.method === 'POST') {
        h.revoked.push(Object.fromEntries(form))
        return json(200, {})
      }
      if (url.pathname === '/api/accounts/oauth/token' && req.method === 'POST') {
        h.exchanges.push(Object.fromEntries(form))
        if (form.get('grant_type') === 'refresh_token')
          return json(200, {
            access_token: 'refreshed-access',
            refresh_token: 'rotated-refresh',
            token_type: 'Bearer',
            expires_in: 1200,
            ...(h.refreshClaims ? { id_token: signedIdentity(h.refreshClaims) } : {}),
            ...h.refreshPayload,
          })
        return json(200, {
          access_token: 'access-from-code',
          refresh_token: 'refresh-from-code',
          expires_in: 900,
          scope: h.grants,
          token_type: 'Bearer',
          id_token: signedIdentity({ nonce: h.nonce, ...h.claims }, h.signingKey),
        })
      }
      json(404, {})
    } catch {
      res.destroy()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const local = 'http://127.0.0.1:' + server.address().port
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  )
  h.net = (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, issuer, 'test refuses network access to external origins')
    return fetch(local + url.pathname, init)
  }
  h.open = async (url) => {
    const u = new URL(url)
    assert.equal(u.origin, issuer)
    const p = u.searchParams
    h.registrations.push(p)
    h.nonce = p.get('nonce')
    const callback = new URL(p.get('redirect_uri'))
    assert.equal(callback.hostname, '127.0.0.1')
    assert.equal(callback.protocol, 'http:')
    assert.equal(callback.pathname, '/auth/callback')
    callback.search = new URLSearchParams({
      state: p.get('state'),
      code: 'single-use-code',
      client_id: h.expectedClient,
    })
    for (const [k, v] of Object.entries(h.callback)) {
      if (v === null) callback.searchParams.delete(k)
      else callback.searchParams.set(k, v)
    }
    if (h.beforeCallback) await h.beforeCallback(new URL(callback))
    const result = await fetch(callback)
    assert.equal(result.status, 200)
    await result.text()
    if (h.afterOpen) await h.afterOpen()
  }
  h.signIn = (saved) => signIn(hostId, saved, h.open, h.net)
  return h
}

test('dynamic registration uses a real loopback, ignores wrong state, and binds the issued ID and S256 verifier', async (t) => {
  const h = await harness(t)
  h.beforeCallback = async (wrong) => {
    wrong.searchParams.set('state', 'another-attempt')
    const result = await fetch(wrong)
    assert.equal(result.status, 400)
    assert.equal(h.exchanges.length, 0)
  }
  const account = await h.signIn()
  const [p] = h.registrations
  assert.equal(p.get('client_id'), 'dynamic_agent_client')
  assert.equal(p.get('ext_agent_host_id'), hostId)
  assert.equal(p.get('agent_name_hint'), 'MOSIC')
  assert.equal(p.get('code_challenge_method'), 'S256')
  assert.equal(p.get('resource'), resource)
  assert.match(p.get('scope'), /chatgpt\.tokens\.use\.direct/)
  const exchanged = h.exchanges[0]
  assert.equal(exchanged.client_id, issuedId)
  assert.equal(exchanged.resource, resource)
  assert.equal(exchanged.redirect_uri, p.get('redirect_uri'))
  assert.equal(createHash('sha256').update(exchanged.code_verifier).digest('base64url'), p.get('code_challenge'))
  assert.equal(account.clientId, issuedId)
  assert.equal(account.subject, 'test-account')
  assert.ok(account.expires > Date.now())
  h.beforeCallback = null
  h.callback.client_id = null // The issued ID is already known for a returning registration.
  const reconnect = await h.signIn(account)
  assert.equal(reconnect.clientId, issuedId)
  const q = h.registrations[1]
  assert.equal(q.get('client_id'), issuedId)
  assert.equal(q.get('id_token_hint'), account.idToken)
  assert.equal(q.has('agent_name_hint'), false)
  for (const field of ['state', 'nonce', 'code_challenge']) assert.notEqual(p.get(field), q.get(field))
})

for (const [name, claims] of [
  ['nonce', { nonce: 'different-attempt' }],
  ['audience', { aud: 'oaiapp_elsewhere' }],
  ['issuer', { iss: 'https://issuer.example.test' }],
  ['expiry', { exp: 1 }],
  ['not-before', { nbf: Math.floor(Date.now() / 1000) + 10000 }],
  ['authorized party', { azp: 'oaiapp_elsewhere' }],
  ['multi-audience authorized party', { aud: [issuedId, 'other'] }],
  ['subject', { sub: '' }],
])
  test('sign-in rejects an otherwise signed identity with invalid ' + name, async (t) => {
    const h = await harness(t)
    h.claims = claims
    await assert.rejects(h.signIn(), /身份验证失败/)
  })

test('refusal, a missing dynamic client ID and a returning client ID mismatch do not exchange a code', async (t) => {
  const h = await harness(t)
  // Finish launching the browser after the rejection has already arrived.
  h.afterOpen = () => new Promise((r) => setTimeout(r, 15))
  h.callback = { error: 'access_denied', code: null }
  await assert.rejects(h.signIn(), /取消|不匹配/)
  h.callback = { client_id: null }
  await assert.rejects(h.signIn(), /取消|不匹配/)
  h.callback = { client_id: 'different-registration' }
  await assert.rejects(h.signIn({ clientId: issuedId, subject: 'original' }), /取消|不匹配/)
  assert.equal(h.exchanges.length, 0)
})
test('plan inference requires the granted scope; a returning registration cannot change its account', async (t) => {
  const h = await harness(t)
  h.grants = 'openid email'
  await assert.rejects(h.signIn(), /套餐推理授权/)
  h.grants = grant
  h.claims = { sub: 'different-account' }
  await assert.rejects(h.signIn({ clientId: issuedId, subject: 'original' }), /套餐推理授权/)
})

test('refresh keeps the registration, rotates tokens, validates returned identity and revokes the renewable token', async (t) => {
  const h = await harness(t)
  const account = await h.signIn()
  h.refreshClaims = { sub: account.subject }
  const renewed = await refresh(account, h.net)
  assert.equal(renewed.subject, account.subject)
  assert.equal(renewed.scope, grant)
  assert.equal(renewed.access, 'refreshed-access')
  assert.equal(renewed.refresh, 'rotated-refresh')
  assert.deepEqual(h.exchanges[1], {
    grant_type: 'refresh_token',
    client_id: issuedId,
    resource,
    refresh_token: account.refresh,
  })
  h.refreshClaims = { sub: 'another-account' }
  await assert.rejects(refresh(renewed, h.net), /身份验证失败/)
  h.refreshClaims = { nonce: 'another-login' }
  await assert.rejects(refresh(renewed, h.net), /身份验证失败/)
  h.refreshClaims = null
  h.refreshPayload = { scope: '' }
  await assert.rejects(refresh(renewed, h.net), /重新授权/)
  h.refreshPayload = { client_id: 'different-client' }
  await assert.rejects(refresh(renewed, h.net), /凭证无效/)
  await revoke(renewed, h.net)
  assert.deepEqual(h.revoked, [{ client_id: issuedId, token: renewed.refresh, token_type_hint: 'refresh_token' }])
  h.availability['/revoke'] = 503
  await assert.rejects(revoke(renewed, h.net), /远程撤销尚未确认/)
})

test('offline token exchange, unavailable public keys and a failed browser launch return controlled failures', async (t) => {
  const h = await harness(t)
  const offline = () => Promise.reject(new Error('offline-test'))
  await assert.rejects(signIn(hostId, null, h.open, offline), /请检查网络/)
  h.availability['/keys'] = 503
  await assert.rejects(h.signIn(), /身份验证公钥/)
  await assert.rejects(
    signIn(
      hostId,
      null,
      async () => {
        throw new Error('browser-unavailable')
      },
      h.net,
    ),
    /browser-unavailable/,
  )
  let callback
  await assert.rejects(
    signIn(
      hostId,
      null,
      async (url) => {
        callback = new URL(url).searchParams.get('redirect_uri')
      },
      h.net,
      { timeoutMs: 35 },
    ),
    /已过期/,
  )
  assert.ok(callback)
  await assert.rejects(fetch(callback), /fetch failed/)
})

test('only a signature from the published key is accepted', async (t) => {
  const h = await harness(t)
  h.signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  await assert.rejects(h.signIn(), /身份验证失败/)
})
test('a callback cannot keep a sign-in alive after its browser launch has stalled', async (t) => {
  const h = await harness(t)
  h.afterOpen = () => new Promise(() => {})
  await assert.rejects(signIn(hostId, null, h.open, h.net, { timeoutMs: 45 }), /已过期/)
  assert.equal(h.exchanges.length, 0)
})
