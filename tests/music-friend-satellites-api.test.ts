import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { onRequestGet as getFriendSatellites } from '../functions/api/me/friend-satellites'
import { onRequestDelete as deleteFriendSatellite } from '../functions/api/me/friend-satellites/[id]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture } from './helpers/music-api-fixture'
import { readPublicPlanet } from '../functions/api/music/planets/[id]'

const issuer = 'https://friend-satellites-test.cloudflareaccess.com'
const audience = 'friend-satellites-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(() => {
  fixture = createMusicApiFixture()
  authority.installJwks()
})

afterEach(() => fixture.close())

const accessEnv = () => createMusicApiEnv(fixture.db, {
  CF_ACCESS_TEAM_DOMAIN: issuer,
  CF_ACCESS_AUD: audience,
})

async function accessRequest(subject: string, method: string, url: string, extraHeaders: HeadersInit = {}) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('Origin', new URL(url).origin)
  return new Request(url, { method, headers })
}

async function readAccessFriends(subject: string) {
  const url = 'https://moodverse.test/api/me/friend-satellites'
  const response = await getFriendSatellites({ request: await accessRequest(subject, 'GET', url), env: accessEnv() } as never)
  return { response, body: await response.json() as { friendSatellites: Array<Record<string, any>> } }
}

test('new and returning anonymous sessions never create virtual friend satellites', async () => {
  const env = createMusicApiEnv(fixture.db, { MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false', MUSIC_EMAIL_LOGIN_ENABLED: 'false' })
  const url = 'https://moodverse.test/api/me/friend-satellites'
  const first = await getFriendSatellites({ request: new Request(url), env } as never)
  expect(first.status).toBe(200)
  const cookie = first.headers.get('set-cookie')!.split(';')[0]
  const initial = await first.json() as { friendSatellites: Array<Record<string, any>> }
  expect(initial.friendSatellites).toEqual([])

  const returning = await getFriendSatellites({
    request: new Request(url, { headers: { Cookie: cookie } }), env,
  } as never)
  const returningBody = await returning.json() as { friendSatellites: Array<Record<string, any>> }
  expect(returningBody.friendSatellites.map((friend) => friend.id)).toEqual(initial.friendSatellites.map((friend) => friend.id))
  expect(returning.headers.get('set-cookie')).toBeNull()

  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friend_satellites').get()).toEqual({count:0})
})

test('accepted real friends also orbit the planet but cannot be removed as virtual companions', async () => {
  await readAccessFriends('owner')
  await readAccessFriends('peer')
  const ownerId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('owner') as { user_id: string }).user_id
  const peerId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('peer') as { user_id: string }).user_id
  const [userA, userB] = [ownerId, peerId].sort()
  fixture.sqlite.prepare("INSERT INTO music_planets (id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES ('peer-planet',?,'真实好友','public','now','now')").run(peerId)
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)')
    .run(userA, userB, '2026-10-08T00:00:00.000Z')

  const { body } = await readAccessFriends('owner')
  expect(body.friendSatellites).toHaveLength(1)
  const realFriend = body.friendSatellites.find((friend) => friend.isVirtual === false)
  expect(realFriend).toMatchObject({ id: `friend-${peerId}`, displayName: '真实好友', canRemove: false })

  const url = `https://moodverse.test/api/me/friend-satellites/${encodeURIComponent(realFriend!.id as string)}`
  const forbiddenRemoval = await deleteFriendSatellite({
    request: await accessRequest('peer', 'DELETE', url), env: accessEnv(), params: { id: realFriend!.id },
  } as never)
  expect(forbiddenRemoval.status).toBe(404)
  expect((await readAccessFriends('owner')).body.friendSatellites).toHaveLength(1)
  fixture.sqlite.prepare('DELETE FROM music_friendships WHERE user_a_id=? AND user_b_id=?').run(userA,userB)
  expect((await readAccessFriends('owner')).body.friendSatellites).toEqual([])
})

test('legacy virtual companion rows stay stored but are never returned or regenerated', async () => {
  await readAccessFriends('legacy-owner')
  const userId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('legacy-owner') as { user_id: string }).user_id
  fixture.sqlite.prepare("INSERT INTO music_friend_satellites (id,owner_user_id,friend_slot,display_name,tagline,color,visual_seed,orbit_radius,orbit_phase,created_at) VALUES ('old-demo',?,0,'虚拟好友','','#ffffff','demo',.2,0,'now')").run(userId)

  const { body } = await readAccessFriends('legacy-owner')
  expect(body.friendSatellites).toEqual([])
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friend_satellites WHERE owner_user_id = ?').get(userId)).toEqual({ count: 1 })
  fixture.sqlite.prepare('DELETE FROM music_friend_satellites WHERE owner_user_id = ?').run(userId)
  const secondRead = await readAccessFriends('legacy-owner')
  expect(secondRead.body.friendSatellites).toEqual([])
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friend_satellites WHERE owner_user_id = ?').get(userId)).toEqual({ count: 0 })
})

test('visitors see the visited planets public friend satellites, including themselves, but never private or blocked peers', async () => {
  const ids: Record<string, string> = {}
  for (const subject of ['host', 'viewer', 'private-peer', 'blocked-peer']) {
    await readAccessFriends(subject)
    ids[subject] = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject=?').get(subject) as { user_id: string }).user_id
    fixture.sqlite.prepare("INSERT INTO music_planets (id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES (?,?,?,?,'now','now')")
      .run(`${subject}-planet`, ids[subject], subject, subject === 'private-peer' ? 'private' : 'public')
    if (subject !== 'host') fixture.sqlite.prepare("INSERT INTO music_friendships (user_a_id,user_b_id,created_at) VALUES (?,?,'now')").run(...[ids.host, ids[subject]].sort())
  }
  fixture.sqlite.prepare("INSERT INTO music_user_blocks (blocker_user_id,blocked_user_id,created_at) VALUES (?,?,'now')").run(ids.viewer, ids['blocked-peer'])
  const planet = await readPublicPlanet(accessEnv(), 'host-planet', ids.viewer)
  const satellites = (planet as unknown as { friendSatellites: Array<Record<string, any>> }).friendSatellites
  expect(satellites).toHaveLength(1)
  expect(satellites[0]).toMatchObject({ planetId: 'viewer-planet', displayName: 'viewer', isVirtual: false, canRemove: false, visual: { seed: 'viewer-planet' } })
  expect(JSON.stringify(satellites)).not.toContain(ids.viewer)
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private' WHERE id='host-planet'").run()
  expect(await readPublicPlanet(accessEnv(), 'host-planet', ids.viewer)).toBeNull()
})
