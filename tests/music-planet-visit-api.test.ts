import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestPost as onRequestVisit } from '../functions/api/music/planets/[id]/visit'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-visit-test.cloudflareaccess.com'
const audience = 'music-visit-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string
let visitorId: string

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  insertCatalogTrack(fixture.sqlite, { id: 'visit-song' })
  ownerId = await createIdentity('visit-owner')
  visitorId = await createIdentity('visit-visitor')
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES ('planet-public', ?, '公开星球', '欢迎来访。', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z'),
           ('planet-private', ?, '私密星球', '只给自己。', 'private', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(ownerId, visitorId)
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES ('planet-public', 'visit-song', 0, 1, '2026-09-30T08:00:00.000Z')
  `).run()
  fixture.sqlite.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES ('public-moment', 'planet-public', 'visit-song', '访客可以看见。', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z'),
           ('private-moment', 'planet-public', 'visit-song', '访客不能看见。', 'private', NULL, '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run()
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
}

async function createIdentity(subject: string) {
  const identity = await authenticatedMusicUser(
    await authority.request({ sub: subject, email: `${subject}@example.com` }),
    env(),
  )
  return identity!.userId
}

async function visit(planetId: string, subject = 'visit-visitor', body: unknown = { isIncognito: false }) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request(`https://moodverse.test/api/music/planets/${planetId}/visit`, {
    method: 'POST',
    headers: { ...Object.fromEntries(signed.headers), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return onRequestVisit({ request, env: env(), params: { id: planetId } } as never)
}

test('visiting a public planet requires a verified Cloudflare Access identity', async () => {
  const response = await onRequestVisit({
    request: new Request('https://moodverse.test/api/music/planets/planet-public/visit', { method: 'POST', body: '{"isIncognito":false}' }),
    env: env(), params: { id: 'planet-public' },
  } as never)

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_visits').get()).toEqual({ count: 0 })
})

test('ordinary visits expose only current public planet data and upsert one visible trace per visitor', async () => {
  const first = await visit('planet-public')
  expect(first.status).toBe(200)
  expect(await first.json()).toMatchObject({ planet: { id: 'planet-public', displayName: '公开星球', moments: [{ contentText: '访客可以看见。' }] } })

  const later = await visit('planet-public')
  expect(later.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count, max(is_incognito) AS is_incognito FROM music_planet_visits WHERE planet_id = ? AND visitor_user_id = ?').get('planet-public', visitorId)).toEqual({ count: 1, is_incognito: 0 })
  expect(JSON.stringify(await later.json())).not.toContain('访客不能看见。')
})

test('an incognito visit stays in the visitor history but is hidden from the planet owner', async () => {
  const response = await visit('planet-public', 'visit-visitor', { isIncognito: true })
  expect(response.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT planet_id, visitor_user_id, is_incognito FROM music_planet_visits').get()).toEqual({
    planet_id: 'planet-public', visitor_user_id: visitorId, is_incognito: 1,
  })
})

test('private planets and self-visits do not create traces or reveal their contents', async () => {
  const privateResult = await visit('planet-private')
  const selfResult = await visit('planet-public', 'visit-owner')

  expect(privateResult.status).toBe(404)
  expect(await privateResult.json()).toEqual({ error: 'PLANET_NOT_FOUND' })
  expect(selfResult.status).toBe(404)
  expect(await selfResult.json()).toEqual({ error: 'PLANET_NOT_FOUND' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_visits').get()).toEqual({ count: 0 })
})

test('only a confirmed Song Portal visit with exact selection evidence creates an Orbit encounter', async () => {
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES ('planet-private', 'visit-song', 0, 1, '2026-09-30T08:00:00.000Z')
  `).run()

  const fromPortal = await visit('planet-public', 'visit-visitor', { isIncognito: false, source: 'song_portal', trackId: 'visit-song' })
  expect(fromPortal.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT visitor_user_id, planet_id, track_id FROM music_song_encounters').get()).toEqual({
    visitor_user_id: visitorId, planet_id: 'planet-public', track_id: 'visit-song',
  })

  fixture.sqlite.prepare('DELETE FROM music_song_encounters').run()
  const fromGalaxy = await visit('planet-public', 'visit-visitor', { isIncognito: false, source: 'galaxy' })
  expect(fromGalaxy.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_song_encounters').get()).toEqual({ count: 0 })
})

test('a caller cannot create a Song Portal encounter without owning an exact-song selection or public Moment', async () => {
  const response = await visit('planet-public', 'visit-visitor', { isIncognito: false, source: 'song_portal', trackId: 'visit-song' })

  expect(response.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_visits').get()).toEqual({ count: 1 })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_song_encounters').get()).toEqual({ count: 0 })
})
