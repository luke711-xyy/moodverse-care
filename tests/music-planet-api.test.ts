import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { onRequestGet, onRequestPatch, onRequestPost } from '../functions/api/me/music-planet'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import {
  createMusicApiEnv,
  createMusicApiFixture,
  insertCatalogTrack,
} from './helpers/music-api-fixture'

const issuer = 'https://music-planet-test.cloudflareaccess.com'
const audience = 'music-planet-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(() => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  for (const id of ['track-a', 'track-b', 'track-c', 'track-d', 'track-e', 'track-f']) {
    insertCatalogTrack(fixture.sqlite, { id })
  }
  insertCatalogTrack(fixture.sqlite, { id: 'track-inactive', active: false })
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

function env() {
  return createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
  })
}

async function call(
  handler: PagesFunction<Env>,
  method: string,
  body?: unknown,
  subject = 'owner-subject-1',
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request(signed.url, {
    method,
    headers: body === undefined
      ? signed.headers
      : { 'Cf-Access-Jwt-Assertion': signed.headers.get('Cf-Access-Jwt-Assertion')!, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handler({ request, env: env() } as never)
}

async function readPlanet(subject = 'owner-subject-1') {
  const response = await call(onRequestGet, 'GET', undefined, subject)
  return { response, body: await response.json() as { planet: null | Record<string, any> } }
}

async function createPlanet(body: unknown, subject = 'owner-subject-1') {
  const response = await call(onRequestPost, 'POST', body, subject)
  return { response, body: await response.json() as Record<string, any> }
}

test('music planet GET requires verified Access identity and returns an empty owner state', async () => {
  const missingAuth = await onRequestGet({
    request: new Request('https://moodverse.test/api/me/music-planet'), env: env(),
  } as never)
  expect(missingAuth.status).toBe(401)

  const { response, body } = await readPlanet()
  expect(response.status).toBe(200)
  expect(body).toEqual({ planet: null })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planets').get()).toEqual({ count: 0 })
})

test('creation requires three active tracks and defaults to a public planet with the first track primary', async () => {
  const { response, body } = await createPlanet({
    displayName: '夜航者',
    tagline: '在歌里慢慢靠岸',
    trackIds: ['track-a', 'track-b', 'track-c'],
  })

  expect(response.status).toBe(201)
  expect(body.planet).toMatchObject({
    displayName: '夜航者',
    tagline: '在歌里慢慢靠岸',
    visibility: 'public',
    tracks: [
      { id: 'track-a', isPrimary: true, position: 0 },
      { id: 'track-b', isPrimary: false, position: 1 },
      { id: 'track-c', isPrimary: false, position: 2 },
    ],
  })
  expect(body.planet.id).toBeTruthy()

  const owner = await readPlanet()
  expect(owner.body.planet.id).toBe(body.planet.id)
  expect(owner.body.planet.createdAt).toBe(body.planet.createdAt)
})

test('creation rejects malformed, duplicate, unknown, inactive, and invalid-primary selections without partial writes', async () => {
  const invalidBodies = [
    { displayName: '缺歌', trackIds: ['track-a', 'track-b'] },
    { displayName: '重复', trackIds: ['track-a', ' track-a ', 'track-c'] },
    { displayName: '未知', trackIds: ['track-a', 'track-b', 'not-in-catalog'] },
    { displayName: '下架', trackIds: ['track-a', 'track-b', 'track-inactive'] },
    { displayName: '主歌不在选择内', trackIds: ['track-a', 'track-b', 'track-c'], primaryTrackId: 'track-d' },
    { trackIds: ['track-a', 'track-b', 'track-c'] },
  ]

  for (const body of invalidBodies) {
    const { response } = await createPlanet(body)
    expect(response.status).toBe(400)
  }
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planets').get()).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_tracks').get()).toEqual({ count: 0 })
})

test('private visibility is an explicit option and the owner cannot create a second planet', async () => {
  const created = await createPlanet({
    displayName: '只给自己听',
    visibility: 'private',
    trackIds: ['track-a', 'track-b', 'track-c'],
    primaryTrackId: 'track-b',
  })
  expect(created.response.status).toBe(201)
  expect(created.body.planet.visibility).toBe('private')
  expect(created.body.planet.tracks.find((track: { id: string }) => track.id === 'track-b').isPrimary).toBe(true)

  const second = await createPlanet({ displayName: '第二颗', trackIds: ['track-a', 'track-b', 'track-c'] })
  expect(second.response.status).toBe(409)
  expect(second.body.error).toBe('PLANET_ALREADY_EXISTS')
})

test('track selection updates keep the planet identity and existing selection timestamps', async () => {
  const created = await createPlanet({ displayName: '慢慢听', trackIds: ['track-a', 'track-b', 'track-c'] })
  const originalId = created.body.planet.id as string
  const originalCreatedAt = created.body.planet.createdAt as string
  const originalTrackASelectedAt = created.body.planet.tracks[0].selectedAt as string

  const updatedResponse = await call(onRequestPatch, 'PATCH', {
    displayName: '慢慢听下去',
    trackIds: ['track-a', 'track-d'],
    primaryTrackId: 'track-d',
  })
  const updated = await updatedResponse.json() as { planet: Record<string, any> }
  expect(updatedResponse.status).toBe(200)
  expect(updated.planet.id).toBe(originalId)
  expect(updated.planet.createdAt).toBe(originalCreatedAt)
  expect(updated.planet.displayName).toBe('慢慢听下去')
  expect(updated.planet.tracks).toEqual([
    expect.objectContaining({ id: 'track-a', selectedAt: originalTrackASelectedAt, isPrimary: false }),
    expect.objectContaining({ id: 'track-d', isPrimary: true }),
  ])

  for (const ids of [['track-a'], ['track-a', 'track-b', 'track-c', 'track-d', 'track-e']]) {
    const response = await call(onRequestPatch, 'PATCH', { trackIds: ids })
    expect(response.status).toBe(200)
  }
})

test('failed updates preserve the old tracks and a different Access identity cannot edit the owner planet', async () => {
  const created = await createPlanet({ displayName: '留在原地', trackIds: ['track-a', 'track-b', 'track-c'] })
  const ownerId = created.body.planet.id
  const invalidPrimary = await call(onRequestPatch, 'PATCH', {
    trackIds: ['track-d'], primaryTrackId: 'track-a',
  })
  expect(invalidPrimary.status).toBe(400)

  const outsider = await readPlanet('another-access-subject')
  expect(outsider.body.planet).toBeNull()
  const outsiderEdit = await call(onRequestPatch, 'PATCH', { displayName: '偷改名字' }, 'another-access-subject')
  expect(outsiderEdit.status).toBe(404)

  const owner = await readPlanet()
  expect(owner.body.planet.id).toBe(ownerId)
  expect(owner.body.planet.displayName).toBe('留在原地')
  expect(owner.body.planet.tracks.map((track: { id: string }) => track.id)).toEqual(['track-a', 'track-b', 'track-c'])
})
