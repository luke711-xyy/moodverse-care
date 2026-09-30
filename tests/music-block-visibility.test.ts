import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import type { Env } from '../functions/_shared'
import { onRequestGet as getOrbit } from '../functions/api/me/orbit'
import { onRequestGet as getGalaxy } from '../functions/api/music/galaxy'
import { onRequestGet as getDiscovery } from '../functions/api/music/discovery'
import { onRequestGet as getSongPortal } from '../functions/api/music/song-portal'
import { onRequestGet as getPlanet } from '../functions/api/music/planets/[id]'
import { onRequestPost as postVisit } from '../functions/api/music/planets/[id]/visit'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-block-test.cloudflareaccess.com'
const audience = 'music-block-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let viewerId: string
let targetId: string
const trackId = 'shared-block-track'

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  viewerId = await identityFor('block-viewer')
  targetId = await identityFor('block-target')
  insertCatalogTrack(fixture.sqlite, { id: trackId, artistName: '共同艺人' })
  fixture.sqlite.prepare("UPDATE music_track_catalog SET genres_json = '[\"ambient\"]' WHERE id = ?").run(trackId)
  createPlanet('block-viewer-planet', viewerId, '浏览者')
  createPlanet('block-target-planet', targetId, '被屏蔽星球')
  addSelection('block-viewer-planet')
  addSelection('block-target-planet')
  seedHistory()
})
afterEach(() => fixture.close())

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
}

async function identityFor(subject: string) {
  const request = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return (await authenticatedMusicUser(request, env()))!.userId
}

function createPlanet(id: string, ownerId: string, name: string) {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '公开介绍', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(id, ownerId, name)
}

function addSelection(planetId: string) {
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, 0, 1, '2026-09-30T08:00:00.000Z')
  `).run(planetId, trackId)
}

function seedHistory() {
  const [userA, userB] = [viewerId, targetId].sort()
  fixture.sqlite.prepare(`
    INSERT INTO music_friendships (user_a_id, user_b_id, created_at)
    VALUES (?, ?, '2026-09-30T08:00:00.000Z')
  `).run(userA, userB)
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_visits (planet_id, visitor_user_id, last_visited_at, is_incognito)
    VALUES ('block-target-planet', ?, '2026-09-29T08:00:00.000Z', 0),
           ('block-viewer-planet', ?, '2026-09-29T08:00:00.000Z', 0)
  `).run(viewerId, targetId)
  fixture.sqlite.prepare(`
    INSERT INTO music_song_encounters (visitor_user_id, planet_id, track_id, first_encountered_at, last_encountered_at)
    VALUES (?, 'block-target-planet', ?, '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z')
  `).run(viewerId, trackId)
  fixture.sqlite.prepare(`
    INSERT INTO music_daily_roam (user_id, recommendation_date, planet_id, position, reason_code, match_score, created_at)
    VALUES (?, ?, 'block-target-planet', 0, 'similar_genre', .7, '2026-09-30T08:00:00.000Z')
  `).run(viewerId, new Date().toISOString().slice(0, 10))
}

async function signedRequest(subject: string, path: string, method = 'GET', body?: unknown) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`https://moodverse.test${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function expectTargetHiddenFromViewer() {
  const discovery = await getDiscovery({
    request: await signedRequest('block-viewer', '/api/music/discovery'), env: env(),
  } as never)
  expect((await discovery.json() as { recommendations: Array<{ planetId: string }> }).recommendations.map(({ planetId }) => planetId))
    .not.toContain('block-target-planet')

  const galaxy = await getGalaxy({
    request: await signedRequest('block-viewer', '/api/music/galaxy?by=genre'), env: env(),
  } as never)
  expect(JSON.stringify(await galaxy.json())).not.toContain('block-target-planet')

  const portal = await getSongPortal({
    request: await signedRequest('block-viewer', `/api/music/song-portal?trackId=${trackId}`), env: env(),
  } as never)
  expect((await portal.json() as { matches: Array<{ planetId: string }> }).matches.map(({ planetId }) => planetId))
    .not.toContain('block-target-planet')

  const orbit = await getOrbit({ request: await signedRequest('block-viewer', '/api/me/orbit'), env: env() } as never)
  const groups = (await orbit.json() as { groups: Record<string, Array<{ planetId?: string; userId?: string }>> }).groups
  expect(JSON.stringify(groups)).not.toContain('block-target-planet')
  expect(JSON.stringify(groups)).not.toContain(targetId)

  const publicRead = await getPlanet({
    request: await signedRequest('block-viewer', '/api/music/planets/block-target-planet'),
    env: env(), params: { id: 'block-target-planet' },
  } as never)
  expect(publicRead.status).toBe(404)

  const oldVisitTime = fixture.sqlite.prepare(`
    SELECT last_visited_at FROM music_planet_visits WHERE planet_id = 'block-target-planet' AND visitor_user_id = ?
  `).get(viewerId) as { last_visited_at: string }
  const visit = await postVisit({
    request: await signedRequest('block-viewer', '/api/music/planets/block-target-planet/visit', 'POST', { isIncognito: false }),
    env: env(), params: { id: 'block-target-planet' },
  } as never)
  expect(visit.status).toBe(404)
  expect(fixture.sqlite.prepare(`
    SELECT last_visited_at FROM music_planet_visits WHERE planet_id = 'block-target-planet' AND visitor_user_id = ?
  `).get(viewerId)).toEqual(oldVisitTime)
}

test('a block hides both accounts from each other across every discovery and visit surface', async () => {
  fixture.sqlite.prepare(`
    INSERT INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at)
    VALUES (?, ?, '2026-09-30T08:00:00.000Z')
  `).run(viewerId, targetId)
  await expectTargetHiddenFromViewer()
})

test('a block works symmetrically even when the target blocked the current viewer', async () => {
  fixture.sqlite.prepare(`
    INSERT INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at)
    VALUES (?, ?, '2026-09-30T08:00:00.000Z')
  `).run(targetId, viewerId)
  await expectTargetHiddenFromViewer()
})
