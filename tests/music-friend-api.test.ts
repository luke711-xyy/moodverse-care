import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import type { Env } from '../functions/_shared'
import { onRequestGet as getSettings, onRequestPatch as patchSettings } from '../functions/api/me/social-settings'
import { onRequestGet as getRequests, onRequestPost as postRequest } from '../functions/api/me/friend-requests'
import { onRequestPatch as answerRequest } from '../functions/api/me/friend-requests/[id]'
import { onRequestGet as getBlocks, onRequestPost as postBlock } from '../functions/api/me/blocks'
import { onRequestDelete as deleteBlock } from '../functions/api/me/blocks/[userId]'
import { onRequestDelete as deleteFriend } from '../functions/api/me/friends/[userId]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture } from './helpers/music-api-fixture'

const issuer = 'https://music-friend-test.cloudflareaccess.com'
const audience = 'music-friend-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  ownerId = await identityFor('social-owner')
  createPlanet('social-owner-planet', ownerId, 'social-owner')
})
afterEach(() => fixture.close())

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
}

async function identityFor(subject: string) {
  const request = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return (await authenticatedMusicUser(request, env()))!.userId
}

function createPlanet(id: string, userId: string, name: string) {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '继续听下去。', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(id, userId, name)
}

async function call(
  subject: string,
  path: string,
  handler: PagesFunction<Env>,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  const request = new Request(`https://moodverse.test${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
  return handler({ request, env: env(), params: options.params ?? {} } as never)
}

test('social settings default to receiving requests and can disable new incoming requests', async () => {
  const initial = await call('social-owner', '/api/me/social-settings', getSettings)
  expect(initial.status).toBe(200)
  expect(await initial.json()).toEqual({ allowFriendRequests: true, allowDriftBottles: true })

  const updated = await call('social-owner', '/api/me/social-settings', patchSettings, {
    method: 'PATCH', body: { allowFriendRequests: false },
  })
  expect(updated.status).toBe(200)
  expect(await updated.json()).toEqual({ allowFriendRequests: false, allowDriftBottles: true })
  expect(fixture.sqlite.prepare('SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = ?').get(ownerId))
    .toEqual({ allow_friend_requests: 0 })

  const senderId = await identityFor('social-setting-sender')
  createPlanet('social-setting-sender-planet', senderId, '发起者')
  const denied = await call('social-setting-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(denied.status).toBe(403)
  expect(await denied.json()).toEqual({ error: 'FRIEND_REQUESTS_DISABLED' })
})

test('friend requests target a public planet, reject self and private targets, and prevent repeat requests after refusal', async () => {
  const senderId = await identityFor('social-sender')
  createPlanet('social-sender-planet', senderId, '发起者')
  const request = await call('social-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(request.status).toBe(201)
  const created = await request.json() as { request: { id: string; status: string } }
  expect(created.request.status).toBe('pending')
  const incoming = await call('social-owner', '/api/me/friend-requests', getRequests)
  expect(await incoming.json()).toMatchObject({ incoming: [expect.objectContaining({ id: created.request.id, displayName: '发起者' })], outgoing: [] })

  const duplicate = await call('social-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(duplicate.status).toBe(409)
  expect(await duplicate.json()).toEqual({ error: 'REQUEST_ALREADY_PENDING' })

  const privateOwnerId = await identityFor('social-private')
  fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE owner_user_id = ?").run(privateOwnerId)
  createPlanet('social-private-planet', privateOwnerId, '不该看见')
  fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE id = 'social-private-planet'").run()
  const privateTarget = await call('social-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-private-planet' },
  })
  expect(privateTarget.status).toBe(404)

  const selfTarget = await call('social-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-sender-planet' },
  })
  expect(selfTarget.status).toBe(400)

  const rejected = await call('social-owner', `/api/me/friend-requests/${created.request.id}`, answerRequest, {
    method: 'PATCH', params: { id: created.request.id }, body: { action: 'reject' },
  })
  expect(rejected.status).toBe(200)

  const retry = await call('social-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(retry.status).toBe(403)
  expect(await retry.json()).toEqual({ error: 'REQUEST_REJECTED' })
})

test('only the recipient can accept; acceptance creates a canonical friendship and the sender cannot accept their own request', async () => {
  const senderId = await identityFor('social-accept-sender')
  createPlanet('social-accept-sender-planet', senderId, '发起者')
  const posted = await call('social-accept-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  const { request } = await posted.json() as { request: { id: string } }

  const wrongRecipient = await call('social-accept-sender', `/api/me/friend-requests/${request.id}`, answerRequest, {
    method: 'PATCH', params: { id: request.id }, body: { action: 'accept' },
  })
  expect(wrongRecipient.status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })

  const accepted = await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, {
    method: 'PATCH', params: { id: request.id }, body: { action: 'accept' },
  })
  expect(accepted.status).toBe(200)
  const pair = [ownerId, senderId].sort()
  expect(fixture.sqlite.prepare('SELECT user_a_id, user_b_id FROM music_friendships').get()).toEqual({ user_a_id: pair[0], user_b_id: pair[1] })

  const incoming = await call('social-owner', '/api/me/friend-requests', getRequests)
  expect(await incoming.json()).toMatchObject({ incoming: [], outgoing: [] })

  const removed = await call('social-accept-sender', `/api/me/friends/${ownerId}`, deleteFriend, {
    method: 'DELETE', params: { userId: ownerId },
  })
  expect(removed.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
  const requestedAgain = await call('social-accept-sender', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(requestedAgain.status).toBe(201)
})

test('blocking removes friendship and pending requests and can be undone only by the blocker', async () => {
  const peerId = await identityFor('social-block-peer')
  createPlanet('social-block-peer-planet', peerId, '另一个星球')
  const pair = [ownerId, peerId].sort()
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)')
    .run(pair[0], pair[1], '2026-09-30T08:00:00.000Z')
  fixture.sqlite.prepare(`
    INSERT INTO music_friend_requests (id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at)
    VALUES ('pending-forward', ?, ?, 'social-block-peer-planet', 'pending', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z'),
           ('pending-reverse', ?, ?, 'social-owner-planet', 'pending', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(ownerId, peerId, peerId, ownerId)

  const blocked = await call('social-owner', '/api/me/blocks', postBlock, {
    method: 'POST', body: { planetId: 'social-block-peer-planet' },
  })
  expect(blocked.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare("SELECT count(*) AS count FROM music_friend_requests WHERE status = 'pending'").get()).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?').get(ownerId, peerId))
    .toEqual({ count: 1 })
  expect((await (await call('social-owner', '/api/me/blocks', getBlocks)).json() as { blocks: unknown[] }).blocks).toHaveLength(1)

  const blockedRequest = await call('social-block-peer', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  expect(blockedRequest.status).toBe(403)
  expect(await blockedRequest.json()).toEqual({ error: 'USER_BLOCKED' })

  await call('social-block-peer', `/api/me/blocks/${ownerId}`, deleteBlock, {
    method: 'DELETE', params: { userId: ownerId },
  })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_user_blocks').get()).toEqual({ count: 1 })

  const unblocked = await call('social-owner', `/api/me/blocks/${peerId}`, deleteBlock, {
    method: 'DELETE', params: { userId: peerId },
  })
  expect(unblocked.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_user_blocks').get()).toEqual({ count: 0 })
})
