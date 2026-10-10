import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { MusicOrbitResponse } from '../src/music-api'
import { authenticatedMusicUser } from '../functions/_shared'
import type { Env } from '../functions/_shared'
import { onRequestGet as getSettings, onRequestPatch as patchSettings } from '../functions/api/me/social-settings'
import { onRequestGet as getRequests, onRequestPost as postRequest } from '../functions/api/me/friend-requests'
import { onRequestPatch as answerRequest } from '../functions/api/me/friend-requests/[id]'
import { onRequestGet as getBlocks, onRequestPost as postBlock } from '../functions/api/me/blocks'
import { onRequestDelete as deleteBlock } from '../functions/api/me/blocks/[userId]'
import { onRequestDelete as deleteFriend } from '../functions/api/me/friends/[userId]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
import { onRequestGet as getGalaxy } from '../functions/api/music/galaxy'
import { onRequestGet as getDiscovery, discoverPublicPlanets } from '../functions/api/music/discovery'
import { onRequestGet as getSongPortal } from '../functions/api/music/song-portal'
import { onRequestGet as getOrbit } from '../functions/api/me/orbit'
import { onRequestGet as getPublicPlanet } from '../functions/api/music/planets/[id]'
import { onRequestPost as postVisit } from '../functions/api/music/planets/[id]/visit'
import { onRequestGet as getMessages, onRequestPost as postMessage } from '../functions/api/me/friends/[userId]/messages'

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
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience, MUSIC_DEMO_SOCIAL_ENABLED: 'true' })
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

test('demo request endpoint returns accepted and both acceptance directions deliver only one greeting', async () => {
  const demoId = await identityFor('demo-actor')
  createPlanet('demo-actor-planet', demoId, '示例星球')
  fixture.sqlite.prepare('UPDATE users SET token_hash = ? WHERE id = ?').run(`demo-disabled:${demoId}`, demoId)
  fixture.sqlite.prepare('INSERT INTO music_demo_actors (user_id, identity_marker, greeting) VALUES (?, ?, ?)').run(demoId, `demo-disabled:${demoId}`, '一段固定问候。')
  const sent = await call('social-owner', '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: 'demo-actor-planet' } })
  expect(sent.status).toBe(201)
  expect((await sent.json() as { request: { status: string } }).request.status).toBe('accepted')
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_direct_messages').get()).toEqual({ n: 1 })
  const recipientId = await identityFor('demo-invite-recipient')
  createPlanet('invite-recipient-planet', recipientId, '新用户')
  fixture.sqlite.prepare("INSERT INTO music_friend_requests (id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at) VALUES ('demo-incoming', ?, ?, 'invite-recipient-planet', 'pending', ?, ?)").run(demoId, recipientId, '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z')
  for (let i = 0; i < 2; i++) {
    const accepted = await call('demo-invite-recipient', '/api/me/friend-requests/demo-incoming', answerRequest, { method: 'PATCH', params: { id: 'demo-incoming' }, body: { action: 'accept' } })
    expect(accepted.status).toBe(200)
  }
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_direct_messages').get()).toEqual({ n: 2 })
})

test('encoded demo invitations can only be accepted by their recipient, then managed with the same decoded peer', async () => {
  const demoId='demo:user:route-friend',requestId='demo:incoming:route-friend',now='2026-10-10T00:00:00Z'
  fixture.sqlite.prepare('INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(demoId,'demo-disabled:'+demoId,now,now)
  createPlanet('demo-route-planet',demoId,'示例好友')
  fixture.sqlite.prepare('INSERT INTO music_friend_requests (id,requester_user_id,recipient_user_id,planet_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(requestId,demoId,ownerId,'social-owner-planet','pending',now,now)
  const options={method:'PATCH',params:{id:encodeURIComponent(requestId)},body:{action:'accept'}}
  const unauthorized=await call('not-the-recipient','/api/me/friend-requests/'+encodeURIComponent(requestId),answerRequest,options)
  expect(unauthorized.status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT status FROM music_friend_requests WHERE id=?').get(requestId)).toEqual({status:'pending'})
  const accepted=await call('social-owner','/api/me/friend-requests/'+encodeURIComponent(requestId),answerRequest,options)
  expect(accepted.status).toBe(200)
  const removed=await call('social-owner','/api/me/friends/'+encodeURIComponent(demoId),deleteFriend,{method:'DELETE',params:{userId:encodeURIComponent(demoId)}})
  expect(removed.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_friendships').get()).toEqual({n:0})
  await call('social-owner','/api/me/blocks',postBlock,{method:'POST',body:{planetId:'demo-route-planet'}})
  expect(fixture.sqlite.prepare('SELECT blocked_user_id FROM music_user_blocks').get()).toEqual({blocked_user_id:demoId})
  const unblocked=await call('social-owner','/api/me/blocks/'+encodeURIComponent(demoId),deleteBlock,{method:'DELETE',params:{userId:encodeURIComponent(demoId)}})
  expect(unblocked.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_user_blocks').get()).toEqual({n:0})
})

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

test('a private friend can be blocked by user id without exposing private planet metadata', async () => {
  const peerId = await identityFor('private-block-peer')
  createPlanet('private-block-planet', peerId, '不应泄露的名称')
  fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE id = 'private-block-planet'").run()
  const [a, b] = [ownerId, peerId].sort()
  fixture.sqlite.prepare("INSERT INTO music_friendships (user_a_id,user_b_id,created_at) VALUES (?,?,'now')").run(a,b)
  const response = await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: peerId } })
  expect(response.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
  expect(await (await call('social-owner', '/api/me/blocks', getBlocks)).json()).toMatchObject({ blocks: [
    { userId: peerId, planetId: null, displayName: '星球暂不可见' },
  ] })
  expect((await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: peerId } })).status).toBe(200)
  await call('social-owner', `/api/me/blocks/${peerId}`, deleteBlock, { method: 'DELETE', params: { userId: peerId } })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
})

test('blocking by user id rejects strangers and self instead of enabling user enumeration', async () => {
  const stranger = await identityFor('block-stranger')
  for (const userId of [stranger, 'unknown-user']) {
    expect((await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId } })).status).toBe(404)
  }
  expect((await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: ownerId } })).status).toBe(400)
  expect((await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: stranger, planetId: 'social-owner-planet' } })).status).toBe(400)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_user_blocks').get()).toEqual({ count: 0 })
})

test('one block excludes both users from every discovery path and contact; reciprocal blocks can only be lifted separately', async () => {
  const peerId = await identityFor('mutual-peer'), controlId = await identityFor('mutual-control')
  createPlanet('mutual-peer-planet', peerId, '对方星球')
  createPlanet('mutual-control-planet', controlId, '正常星球')
  insertCatalogTrack(fixture.sqlite, { id: 'shared-song' })
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET genres_json='["Pop"]' WHERE id='shared-song'`).run()
  for (const planetId of ['social-owner-planet', 'mutual-peer-planet', 'mutual-control-planet']) {
    fixture.sqlite.prepare("INSERT INTO music_planet_tracks (planet_id,track_id,position,is_primary,selected_at) VALUES (?,'shared-song',0,1,'now')").run(planetId)
  }
  const [a,b] = [ownerId, peerId].sort()
  fixture.sqlite.prepare("INSERT INTO music_friendships (user_a_id,user_b_id,created_at) VALUES (?,?,'now')").run(a,b)
  const directions = [
    { subject: 'social-owner', viewer: ownerId, peer: peerId, planet: 'mutual-peer-planet' },
    { subject: 'mutual-peer', viewer: peerId, peer: ownerId, planet: 'social-owner-planet' },
  ]
  for (const direction of directions) {
    expect((await call(direction.subject, '/visit', postVisit, { method: 'POST', params: { id: direction.planet }, body: { isIncognito: false, source: 'song_portal', trackId: 'shared-song' } })).status).toBe(200)
  }
  async function discover(subject: string) {
    const result: Record<string, string[]> = {}
    for (const by of ['song','artist','genre']) {
      const response = await call(subject, `/api/music/galaxy?by=${by}`, getGalaxy)
      expect(response.status).toBe(200)
      const body = await response.json() as { groups: Array<{ planets: Array<{ planetId: string }> }> }
      result[`galaxy-${by}`] = body.groups.flatMap(group => group.planets.map(planet => planet.planetId))
    }
    const roam = await (await call(subject, '/api/music/discovery', getDiscovery)).json() as { recommendations: Array<{ planetId: string }> }
    result.roam = roam.recommendations.map(planet => planet.planetId)
    const portal = await (await call(subject, '/api/music/song-portal?trackId=shared-song', getSongPortal)).json() as { matches: Array<{ planetId: string }> }
    result.collision = portal.matches.map(planet => planet.planetId)
    return result
  }
  for (const direction of directions) for (const planets of Object.values(await discover(direction.subject))) {
    expect(planets).toContain(direction.planet)
    expect(planets).toContain('mutual-control-planet')
  }
  expect((await call('social-owner', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: peerId } })).status).toBe(200)
  for (const direction of directions) {
    for (const planets of Object.values(await discover(direction.subject))) {
      expect(planets).not.toContain(direction.planet)
      expect(planets).toContain('mutual-control-planet')
    }
    const random = await discoverPublicPlanets(env(), direction.viewer, true)
    expect(random.recommendations.map(planet => planet.planetId)).not.toContain(direction.planet)
    const orbit = await (await call(direction.subject, '/api/me/orbit', getOrbit)).json() as MusicOrbitResponse
    for (const group of Object.values(orbit.groups)) expect(group.some(planet => planet.planetId === direction.planet)).toBe(false)
    expect((await call(direction.subject, '/planet', getPublicPlanet, { params: { id: direction.planet } })).status).toBe(404)
    expect((await call(direction.subject, '/visit', postVisit, { method: 'POST', params: { id: direction.planet }, body: { isIncognito: false } })).status).toBe(404)
    expect((await call(direction.subject, '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: direction.planet } })).status).toBe(403)
    expect((await call(direction.subject, '/messages', getMessages, { params: { userId: direction.peer } })).status).toBe(403)
    expect((await call(direction.subject, '/messages', postMessage, { method: 'POST', params: { userId: direction.peer }, body: { contentText: 'blocked message' } })).status).toBe(403)
  }
  // The second user may independently block the known relationship too.
  expect((await call('mutual-peer', '/api/me/blocks', postBlock, { method: 'POST', body: { userId: ownerId } })).status).toBe(200)
  await call('social-owner', '/unblock', deleteBlock, { method: 'DELETE', params: { userId: peerId } })
  for (const direction of directions) {
    expect((await call(direction.subject, '/planet', getPublicPlanet, { params: { id: direction.planet } })).status).toBe(404)
  }
  await call('mutual-peer', '/unblock', deleteBlock, { method: 'DELETE', params: { userId: ownerId } })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
  for (const direction of directions) {
    expect((await call(direction.subject, '/planet', getPublicPlanet, { params: { id: direction.planet } })).status).toBe(200)
    expect((await call(direction.subject, '/messages', getMessages, { params: { userId: direction.peer } })).status).toBe(403)
  }
})

test('accepting either of two crossed requests settles both directions and clears both users pending lists', async () => {
  const peerId = await identityFor('crossed-peer')
  createPlanet('crossed-peer-planet', peerId, '另一端')
  const forward = await call('crossed-peer', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  const { request } = await forward.json() as { request: { id: string } }
  expect((await call('social-owner', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'crossed-peer-planet' },
  })).status).toBe(201)
  expect((await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, {
    method: 'PATCH', params: { id: request.id }, body: { action: 'accept' },
  })).status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT status FROM music_friend_requests ORDER BY id').all())
    .toEqual([{ status: 'accepted' }, { status: 'accepted' }])
  for (const subject of ['social-owner', 'crossed-peer']) {
    expect(await (await call(subject, '/api/me/friend-requests', getRequests)).json()).toEqual({ incoming: [], outgoing: [] })
  }
})

test('existing friendships hide historical pending rows without altering user data on read', async () => {
  const peerId = await identityFor('legacy-pending-peer')
  createPlanet('legacy-pending-peer-planet', peerId, '已是好友')
  await call('legacy-pending-peer', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })
  const [a, b] = [ownerId, peerId].sort()
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)').run(a, b, '2026-10-10')
  for (const subject of ['social-owner', 'legacy-pending-peer']) {
    expect(await (await call(subject, '/api/me/friend-requests', getRequests)).json()).toEqual({ incoming: [], outgoing: [] })
  }
  expect(fixture.sqlite.prepare("SELECT count(*) AS count FROM music_friend_requests WHERE status='pending'").get()).toEqual({ count: 1 })
})

test('retrying a confirmed acceptance is idempotent for the recipient only', async () => {
  const peerId = await identityFor('retry-peer')
  createPlanet('retry-peer-planet', peerId, '申请者')
  const { request } = await (await call('retry-peer', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })).json() as { request: { id: string } }
  const options = { method: 'PATCH', params: { id: request.id }, body: { action: 'accept' } }
  await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, options)
  expect((await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, options)).status).toBe(200)
  expect((await call('retry-peer', `/api/me/friend-requests/${request.id}`, answerRequest, options)).status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 1 })
})

test('live snapshots use one relationship state, suppress stale pending rows, and do not disclose private planets', async () => {
  const peerId = await identityFor('snapshot-peer')
  createPlanet('snapshot-peer-planet', peerId, '私密名字')
  await call('snapshot-peer', '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: 'social-owner-planet' } })
  const [a, b] = [ownerId, peerId].sort()
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)').run(a, b, '2026-10-10')
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private' WHERE id='snapshot-peer-planet'").run()
  const response = await call('social-owner', '/api/me/friend-requests?live=1', getRequests)
  expect(response.headers.get('cache-control')).toContain('no-store')
  const snapshot = await response.json() as { incoming: unknown[]; outgoing: unknown[]; friends: MusicOrbitResponse['groups']['friends'] }
  expect(snapshot).toMatchObject({ incoming: [], outgoing: [], friends: [{ userId: peerId, planetId: null, displayName: '好友星球', canVisit: false }] })
  expect(JSON.stringify(snapshot)).not.toContain('私密名字')
  expect(snapshot.friends[0]).not.toHaveProperty('visual')
})

test('social cards include the actual public planet visual for requests and friends but never private visuals', async () => {
  const peerId = await identityFor('visual-peer')
  createPlanet('visual-peer-planet', peerId, '公开外观')
  const { request } = await (await call('visual-peer', '/api/me/friend-requests', postRequest, {
    method: 'POST', body: { planetId: 'social-owner-planet' },
  })).json() as { request: { id: string } }
  const read = async (subject: string) => (await call(subject, '/api/me/friend-requests?live=1', getRequests)).json() as Promise<any>
  expect((await read('social-owner')).incoming[0].visual).toMatchObject({ seed: 'visual-peer-planet', schemaVersion: 3 })
  expect((await read('visual-peer')).outgoing[0].visual).toMatchObject({ seed: 'social-owner-planet', schemaVersion: 3 })
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private' WHERE id='visual-peer-planet'").run()
  expect((await read('social-owner')).incoming[0]).not.toHaveProperty('visual')
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='public' WHERE id='visual-peer-planet'").run()
  await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, {
    method: 'PATCH', params: { id: request.id }, body: { action: 'accept' },
  })
  expect((await read('social-owner')).friends[0].visual).toMatchObject({ seed: 'visual-peer-planet', schemaVersion: 3 })
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private' WHERE id='visual-peer-planet'").run()
  expect((await read('social-owner')).friends[0]).not.toHaveProperty('visual')
})

test('an open authenticated stream delivers a new request and its acceptance to the other user without reloading', async () => {
  const peerId = await identityFor('stream-peer')
  createPlanet('stream-peer-planet', peerId, '另一端')
  const receiver = await call('social-owner', '/api/me/friend-requests?stream=1', getRequests)
  expect(receiver.headers.get('content-type')).toContain('text/event-stream')
  const sender = await call('stream-peer', '/api/me/friend-requests?stream=1', getRequests)
  const recipientReader = receiver.body!.getReader(), senderReader = sender.body!.getReader()
  const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const chunk = new TextDecoder().decode((await reader.read()).value)
    const data = chunk.split('\n').find(line => line.startsWith('data: '))
    expect(data).toBeTruthy()
    return JSON.parse(data!.slice(6))
  }
  try {
    expect(await read(recipientReader)).toMatchObject({ incoming: [], outgoing: [], friends: [] })
    expect(await read(senderReader)).toMatchObject({ incoming: [], outgoing: [], friends: [] })
    const { request } = await (await call('stream-peer', '/api/me/friend-requests', postRequest, {
      method: 'POST', body: { planetId: 'social-owner-planet' },
    })).json() as { request: { id: string } }
    expect(await read(recipientReader)).toMatchObject({ incoming: [{ id: request.id, displayName: '另一端' }] })
    expect(await read(senderReader)).toMatchObject({ outgoing: [{ id: request.id, status: 'pending' }] })
    await call('social-owner', `/api/me/friend-requests/${request.id}`, answerRequest, {
      method: 'PATCH', params: { id: request.id }, body: { action: 'accept' },
    })
    expect(await read(senderReader)).toMatchObject({ incoming: [], outgoing: [], friends: [{ userId: ownerId }] })
    expect(await read(recipientReader)).toMatchObject({ incoming: [], outgoing: [], friends: [{ userId: peerId }] })
  } finally { await recipientReader.cancel(); await senderReader.cancel() }
}, 15000)

test('social streaming requires authentication and rejects cross-origin reads', async () => {
  const request = new Request('https://moodverse.test/api/me/friend-requests?stream=1')
  expect((await getRequests({ request, env: env() } as never)).status).toBe(401)
  const signed = await authority.request({ sub: 'social-owner', email: 'social-owner@example.com' })
  const headers = new Headers(signed.headers); headers.set('origin', 'https://untrusted.example')
  expect((await getRequests({ request: new Request(request.url, { headers }), env: env() } as never)).status).toBe(403)
})

test('unfriending cancels historical crossed pending rows so they cannot reappear as new requests', async () => {
  const peerId = await identityFor('unfriend-legacy-peer')
  createPlanet('unfriend-legacy-planet', peerId, '旧关系')
  await call('unfriend-legacy-peer', '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: 'social-owner-planet' } })
  const [a, b] = [ownerId, peerId].sort()
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)').run(a, b, '2026-10-10')
  await call('social-owner', `/api/me/friends/${peerId}`, deleteFriend, { method: 'DELETE', params: { userId: peerId } })
  expect(await (await call('social-owner', '/api/me/friend-requests', getRequests)).json()).toEqual({ incoming: [], outgoing: [] })
  expect((await call('unfriend-legacy-peer', '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: 'social-owner-planet' } })).status).toBe(201)
})

test('unfriend on a non-friend cannot cancel an outstanding request as a side effect', async () => {
  const peerId = await identityFor('not-friend-peer')
  createPlanet('not-friend-planet', peerId, '申请者')
  await call('not-friend-peer', '/api/me/friend-requests', postRequest, { method: 'POST', body: { planetId: 'social-owner-planet' } })
  expect((await call('social-owner', `/api/me/friends/${peerId}`, deleteFriend, { method: 'DELETE', params: { userId: peerId } })).status).toBe(404)
  expect(fixture.sqlite.prepare("SELECT status FROM music_friend_requests").get()).toEqual({ status: 'pending' })
})
