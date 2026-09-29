import { vi } from 'vitest'

const encode = (value: string | ArrayBuffer) => Buffer.from(value).toString('base64url')

export async function createAccessTestAuthority(issuer: string, audience: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const exportedKey = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const publicJwk = { ...exportedKey, kid: 'test-access-key', alg: 'RS256', use: 'sig' }

  return {
    installJwks() {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const requestUrl = new URL(input.toString())
        if (requestUrl.origin !== issuer || requestUrl.pathname !== '/cdn-cgi/access/certs') {
          return new Response('not found', { status: 404 })
        }
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }))
    },
    async request(claimOverrides: Record<string, unknown> = {}) {
      const now = Math.floor(Date.now() / 1000)
      const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-access-key' }))
      const claims = {
        aud: [audience],
        email: 'owner@example.com',
        exp: now + 300,
        iat: now,
        nbf: now - 1,
        iss: issuer,
        type: 'app',
        sub: 'owner-subject-1',
        ...claimOverrides,
      }
      const payload = encode(JSON.stringify(claims))
      const signingInput = `${header}.${payload}`
      const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        pair.privateKey,
        new TextEncoder().encode(signingInput),
      )
      return new Request('https://moodverse.test/api/me/music-planet', {
        headers: { 'Cf-Access-Jwt-Assertion': `${signingInput}.${encode(signature)}` },
      })
    },
  }
}
