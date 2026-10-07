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

function env(overrides: Partial<Env> = {}) {
  return createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    ...overrides,
  })
}

async function call(
  handler: PagesFunction<Env>,
  method: string,
  body?: unknown,
  subject = 'owner-subject-1',
  overrides: Partial<Env> = {},
  pending: Promise<unknown>[] = [],
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request(signed.url, {
    method,
    headers: body === undefined
      ? signed.headers
      : { 'Cf-Access-Jwt-Assertion': signed.headers.get('Cf-Access-Jwt-Assertion')!, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handler({ request, env: env(overrides), waitUntil: (task: Promise<unknown>) => pending.push(task) } as never)
}

async function readPlanet(subject = 'owner-subject-1') {
  const response = await call(onRequestGet, 'GET', undefined, subject)
  return { response, body: await response.json() as { planet: null | Record<string, any>; isDemoAccount: boolean } }
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
  expect(body).toEqual({ planet: null, isDemoAccount: false })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planets').get()).toEqual({ count: 0 })
})

test('default anonymous sessions persist in an HttpOnly device cookie', async () => {
  const anonymousEnv = env({ MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false', MUSIC_EMAIL_LOGIN_ENABLED: 'false' })
  const first = await onRequestGet({
    request: new Request('https://moodverse.test/api/me/music-planet'), env: anonymousEnv,
  } as never)
  expect(first.status).toBe(200)
  const cookie = first.headers.get('set-cookie')
  expect(cookie).toMatch(/^mv_session=.*; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/)
  const firstUser = fixture.sqlite.prepare('SELECT id FROM users').get() as { id: string }

  const returningDevice = await onRequestGet({
    request: new Request('https://moodverse.test/api/me/music-planet', { headers: { Cookie: cookie!.split(';')[0] } }),
    env: anonymousEnv,
  } as never)
  expect(returningDevice.status).toBe(200)
  expect(returningDevice.headers.get('set-cookie')).toBeNull()
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users').get()).toEqual({ count: 1 })
  expect(fixture.sqlite.prepare('SELECT id FROM users').get()).toEqual(firstUser)

  const anotherDevice = await onRequestGet({
    request: new Request('https://moodverse.test/api/me/music-planet'), env: anonymousEnv,
  } as never)
  expect(anotherDevice.headers.get('set-cookie')).toMatch(/^mv_session=/)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users').get()).toEqual({ count: 2 })
})

test('marks only the configured demo email without returning its email address', async () => {
  const demo = await call(onRequestGet, 'GET', undefined, 'hackathon-demo', {
    MUSIC_DEMO_EMAIL: '  HACKATHON-DEMO@example.com  ',
  })
  const demoBody = await demo.json() as Record<string, unknown>
  expect(demoBody).toMatchObject({ planet: null, isDemoAccount: true })
  expect(demoBody).not.toHaveProperty('email')

  const regular = await call(onRequestGet, 'GET', undefined, 'regular-user', {
    MUSIC_DEMO_EMAIL: 'hackathon-demo@example.com',
  })
  expect(await regular.json()).toMatchObject({ planet: null, isDemoAccount: false })
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

test('changing selected tracks automatically queues a planet composition refresh', async () => {
  await createPlanet({ displayName: '改曲之后', trackIds: ['track-a', 'track-b', 'track-c'] })
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    return new Response(JSON.stringify({
      model: { name: 'qwen-local', version: '4b-q4-v1' },
      output: {
        schemaVersion: 2,
        summary: '被新的曲目带向远方。',
        palette: { surface: '#315f98', ocean: '#102d5c', accent: '#8ec9ed' },
        atmosphere: 'starlit',
        motion: 'drift',
        particleDensity: 0.42,
        terrainFeatures: { mountainRanges: 4, basins: 2, canyons: 1, escarpments: 1 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  const pending: Promise<unknown>[] = []
  const updated = await call(onRequestPatch, 'PATCH', {
    trackIds: ['track-a', 'track-d'],
  }, 'owner-subject-1', {
    MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  }, pending)

  expect(updated.status).toBe(200)
  expect(pending).toHaveLength(1)
  await Promise.all(pending)
  expect(fixture.sqlite.prepare(`
    SELECT status, model_name FROM music_ai_tasks WHERE kind = 'planet_composer'
  `).get()).toEqual({ status: 'succeeded', model_name: 'qwen-local' })
  expect(JSON.parse((fixture.sqlite.prepare('SELECT visual_json FROM music_planets').get() as { visual_json: string }).visual_json).summary)
    .toBe('被新的曲目带向远方。')
})

test('owner planet response omits HTTPS music URLs containing embedded credentials', async () => {
  await createPlanet({ displayName: '安全链接', trackIds: ['track-a', 'track-b', 'track-c'] })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET official_url = 'https://provider-user:provider-secret@music.example/track',
        cover_url = 'https://image-user:image-secret@images.example/cover.jpg'
    WHERE id = 'track-a'
  `).run()

  const { body } = await readPlanet()
  expect(body.planet?.tracks[0]).toMatchObject({ officialUrl: null, coverUrl: null })
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
