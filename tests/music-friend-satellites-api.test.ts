import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { onRequestGet as getFriendSatellites } from '../functions/api/me/friend-satellites'
import { onRequestDelete as deleteFriendSatellite } from '../functions/api/me/friend-satellites/[id]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture } from './helpers/music-api-fixture'

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

test('new anonymous sessions receive three persistent virtual friend satellites that can be removed', async () => {
  const env = createMusicApiEnv(fixture.db, { MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false', MUSIC_EMAIL_LOGIN_ENABLED: 'false' })
  const url = 'https://moodverse.test/api/me/friend-satellites'
  const first = await getFriendSatellites({ request: new Request(url), env } as never)
  expect(first.status).toBe(200)
  const cookie = first.headers.get('set-cookie')!.split(';')[0]
  const initial = await first.json() as { friendSatellites: Array<Record<string, any>> }
  expect(initial.friendSatellites).toHaveLength(3)
  expect(initial.friendSatellites.map((friend) => friend.displayName)).toEqual(['小满', '星野', '阿澄'])
  expect(initial.friendSatellites.every((friend) => friend.isVirtual && friend.canRemove)).toBe(true)

  const returning = await getFriendSatellites({
    request: new Request(url, { headers: { Cookie: cookie } }), env,
  } as never)
  const returningBody = await returning.json() as { friendSatellites: Array<Record<string, any>> }
  expect(returningBody.friendSatellites.map((friend) => friend.id)).toEqual(initial.friendSatellites.map((friend) => friend.id))
  expect(returning.headers.get('set-cookie')).toBeNull()

  const removedId = initial.friendSatellites[1].id as string
  const removal = await deleteFriendSatellite({
    request: new Request(`${url}/${encodeURIComponent(removedId)}`, {
      method: 'DELETE', headers: { Origin: 'https://moodverse.test', Cookie: cookie },
    }), env, params: { id: removedId },
  } as never)
  expect(removal.status).toBe(200)
  expect(await removal.json()).toEqual({ deleted: true })

  const afterRemoval = await getFriendSatellites({
    request: new Request(url, { headers: { Cookie: cookie } }), env,
  } as never)
  const remaining = await afterRemoval.json() as { friendSatellites: Array<Record<string, any>> }
  expect(remaining.friendSatellites).toHaveLength(2)
  expect(remaining.friendSatellites.some((friend) => friend.id === removedId)).toBe(false)
  expect(fixture.sqlite.prepare('SELECT deleted_at FROM music_friend_satellites WHERE id = ?').get(removedId)).not.toBeNull()
})

test('accepted real friends also orbit the planet but cannot be removed as virtual companions', async () => {
  await readAccessFriends('owner')
  await readAccessFriends('peer')
  const ownerId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('owner') as { user_id: string }).user_id
  const peerId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('peer') as { user_id: string }).user_id
  const [userA, userB] = [ownerId, peerId].sort()
  fixture.sqlite.prepare('INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)')
    .run(userA, userB, '2026-10-08T00:00:00.000Z')

  const { body } = await readAccessFriends('owner')
  expect(body.friendSatellites).toHaveLength(4)
  const realFriend = body.friendSatellites.find((friend) => friend.isVirtual === false)
  expect(realFriend).toMatchObject({ id: `friend-${peerId}`, displayName: '好友星球', canRemove: false })

  const ownVirtual = body.friendSatellites.find((friend) => friend.isVirtual === true)!
  const url = `https://moodverse.test/api/me/friend-satellites/${encodeURIComponent(ownVirtual.id as string)}`
  const forbiddenRemoval = await deleteFriendSatellite({
    request: await accessRequest('peer', 'DELETE', url), env: accessEnv(), params: { id: ownVirtual.id },
  } as never)
  expect(forbiddenRemoval.status).toBe(404)
  expect((await readAccessFriends('owner')).body.friendSatellites).toHaveLength(4)
})

test('legacy accounts missing companion rows are backfilled exactly once', async () => {
  await readAccessFriends('legacy-owner')
  const userId = (fixture.sqlite.prepare('SELECT user_id FROM music_access_identities WHERE access_subject = ?').get('legacy-owner') as { user_id: string }).user_id
  fixture.sqlite.prepare('DELETE FROM music_friend_satellites WHERE owner_user_id = ?').run(userId)

  const { body } = await readAccessFriends('legacy-owner')
  expect(body.friendSatellites).toHaveLength(3)
  fixture.sqlite.prepare('DELETE FROM music_friend_satellites WHERE owner_user_id = ?').run(userId)
  const secondRead = await readAccessFriends('legacy-owner')
  expect(secondRead.body.friendSatellites).toHaveLength(3)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_friend_satellites WHERE owner_user_id = ?').get(userId)).toEqual({ count: 3 })
})
