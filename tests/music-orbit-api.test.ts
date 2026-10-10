import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestGet as onRequestOrbit } from '../functions/api/me/orbit'
import { onRequestPost as onRequestVisit } from '../functions/api/music/planets/[id]/visit'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-orbit-test.cloudflareaccess.com'
const audience = 'music-orbit-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  insertCatalogTrack(fixture.sqlite, { id: 'orbit-song' })
  ownerId = await createIdentity('orbit-owner')
  createPlanet('planet-owner', ownerId, 'public')
  addSelection('planet-owner', 'orbit-song')
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
}

function createPlanet(id: string, owner: string, visibility: 'public' | 'private', trackId?: string) {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '沿着歌声继续。', ?, '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(id, owner, id, visibility)
  if (trackId) addSelection(id, trackId)
}

function addSelection(planetId: string, trackId: string) {
  const position = (fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_tracks WHERE planet_id = ?').get(planetId) as { count: number }).count
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, ?, ?, '2026-09-30T08:00:00.000Z')
  `).run(planetId, trackId, position, position === 0 ? 1 : 0)
}

async function createIdentity(subject: string) {
  const identity = await authenticatedMusicUser(
    await authority.request({ sub: subject, email: `${subject}@example.com` }),
    env(),
  )
  return identity!.userId
}

async function requestFor(subject: string, path: string) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return new Request(`https://moodverse.test${path}`, { headers: signed.headers })
}

async function getOrbit(subject = 'orbit-owner') {
  const request = await requestFor(subject, '/api/me/orbit')
  return onRequestOrbit({ request, env: env() } as never)
}

async function visit(planetId: string, subject: string, isIncognito: boolean) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request(`https://moodverse.test/api/music/planets/${planetId}/visit`, {
    method: 'POST',
    headers: { ...Object.fromEntries(signed.headers), 'content-type': 'application/json' },
    body: JSON.stringify({ isIncognito }),
  })
  return onRequestVisit({ request, env: env(), params: { id: planetId } } as never)
}

test('Orbit requires a verified identity and does not create personal state for anonymous reads', async () => {
  const response = await onRequestOrbit({ request: new Request('https://moodverse.test/api/me/orbit'), env: env() } as never)

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_daily_roam').get()).toEqual({ count: 0 })
})

test('Orbit keeps the five groups separate, hides private targets and incoming incognito visits, and retains the visitor own incognito history', async () => {
  const visitorId = await createIdentity('orbit-visible-visitor')
  createPlanet('planet-visible-visitor', visitorId, 'public', 'orbit-song')
  const hiddenVisitorId = await createIdentity('orbit-hidden-visitor')
  createPlanet('planet-hidden-visitor', hiddenVisitorId, 'public', 'orbit-song')
  const hiddenTargetId = await createIdentity('orbit-private-target')
  createPlanet('planet-private-target', hiddenTargetId, 'private', 'orbit-song')
  const remoteId = await createIdentity('orbit-remote')
  createPlanet('planet-remote', remoteId, 'public', 'orbit-song')
  for (const friendId of [hiddenTargetId, remoteId]) {
    const [userA, userB] = [ownerId, friendId].sort()
    fixture.sqlite.prepare(`
      INSERT INTO music_friendships (user_a_id, user_b_id, created_at)
      VALUES (?, ?, '2026-09-30T09:00:00.000Z')
    `).run(userA, userB)
  }

  await visit('planet-owner', 'orbit-visible-visitor', false)
  await visit('planet-owner', 'orbit-hidden-visitor', true)
  await visit('planet-remote', 'orbit-owner', true)
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_visits (planet_id, visitor_user_id, last_visited_at, is_incognito)
    VALUES ('planet-private-target', ?, '2026-09-30T09:00:00.000Z', 0)
  `).run(ownerId)
  fixture.sqlite.prepare(`
    INSERT INTO music_song_encounters (visitor_user_id, planet_id, track_id, first_encountered_at, last_encountered_at)
    VALUES (?, 'planet-remote', 'orbit-song', '2026-09-30T09:00:00.000Z', '2026-09-30T09:10:00.000Z'),
           (?, 'planet-private-target', 'orbit-song', '2026-09-30T09:00:00.000Z', '2026-09-30T09:10:00.000Z')
  `).run(ownerId, ownerId)

  const response = await getOrbit()
  const body = await response.json() as {
    date: string
    groups: {
      songEncounters: Array<{ planetId: string }>
      friends: Array<{ planetId: string | null; displayName: string; canVisit: boolean }>
      visitedByMe: Array<{ planetId: string; isIncognito: boolean }>
      visitorsToMe: Array<{ userId: string; planetId: string }>
      dailyRoam: Array<{ planetId: string }>
    }
  }

  expect(response.status).toBe(200)
  expect(body.groups).toHaveProperty('songEncounters')
  expect(body.groups).toHaveProperty('friends')
  expect(body.groups).toHaveProperty('visitedByMe')
  expect(body.groups).toHaveProperty('visitorsToMe')
  expect(body.groups).toHaveProperty('dailyRoam')
  expect(body.groups.songEncounters.map(({ planetId }) => planetId)).toEqual(['planet-remote'])
  expect(body.groups.friends).toContainEqual(expect.objectContaining({ planetId: 'planet-remote', displayName: 'planet-remote', canVisit: true }))
  expect(body.groups.friends).toContainEqual(expect.objectContaining({ planetId: null, displayName: '好友星球', canVisit: false }))
  expect(body.groups.visitedByMe).toContainEqual(expect.objectContaining({ planetId: 'planet-remote', isIncognito: true }))
  expect(body.groups.visitedByMe.map(({ planetId }) => planetId)).not.toContain('planet-private-target')
  expect(body.groups.visitorsToMe).toEqual([expect.objectContaining({ userId: visitorId, planetId: 'planet-visible-visitor' })])
  expect(JSON.stringify(body)).not.toContain('orbit-hidden-visitor')
  expect(JSON.stringify(body)).not.toContain('planet-private-target')
  expect(body.date).toBe(new Date().toISOString().slice(0, 10))
})

test('Orbit no longer creates or returns daily-roam recommendations', async () => {
  const candidateAId = await createIdentity('orbit-daily-a')
  const candidateBId = await createIdentity('orbit-daily-b')
  const privateCandidateId = await createIdentity('orbit-daily-private')
  createPlanet('planet-daily-a', candidateAId, 'public', 'orbit-song')
  createPlanet('planet-daily-b', candidateBId, 'public', 'orbit-song')
  createPlanet('planet-daily-private', privateCandidateId, 'private', 'orbit-song')
  await visit('planet-daily-a', 'orbit-owner', false)

  const first = await getOrbit()
  const firstBody = await first.json() as { groups: { dailyRoam: Array<{ planetId: string; reasonCode: string }> } }
  const second = await getOrbit()
  const secondBody = await second.json() as { groups: { dailyRoam: Array<{ planetId: string; reasonCode: string }> } }

  expect(first.status).toBe(200)
  expect(firstBody.groups.dailyRoam).toEqual([])
  expect(secondBody.groups.dailyRoam).toEqual([])
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_daily_roam').get()).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_visits').get()).toEqual({ count: 1 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_song_encounters').get()).toEqual({ count: 0 })
  expect(JSON.stringify(firstBody)).not.toContain('planet-daily-private')
})

test('friend Orbit cards include unread direct-message counts without exposing message content', async () => {
  const friendId = await createIdentity('orbit-message-friend')
  createPlanet('planet-message-friend', friendId, 'public')
  const [userA, userB] = [ownerId, friendId].sort()
  fixture.sqlite.prepare(`INSERT INTO music_friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, '2026-09-30T09:00:00.000Z')`).run(userA, userB)
  fixture.sqlite.prepare(`
    INSERT INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at)
    VALUES ('unread-visible', ?, ?, 'private message text', '2026-09-30T09:05:00.000Z'),
           ('unread-hidden', ?, ?, 'hidden message text', '2026-09-30T09:06:00.000Z')
  `).run(friendId, ownerId, friendId, ownerId)
  fixture.sqlite.prepare(`UPDATE music_direct_messages SET hidden_for_recipient = 1 WHERE id = 'unread-hidden'`).run()

  const response = await getOrbit()
  const body = await response.json() as { groups: { friends: Array<{ userId: string; unreadCount: number }> } }

  expect(body.groups.friends).toContainEqual(expect.objectContaining({ userId: friendId, unreadCount: 1 }))
  expect(JSON.stringify(body)).not.toContain('private message text')
  expect(JSON.stringify(body)).not.toContain('hidden message text')
})
