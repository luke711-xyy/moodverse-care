import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestGet as onRequestSongPortal } from '../functions/api/music/song-portal'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createDitherSpec, type DitherPlanetSpec } from '../src/music/dither/appearance'
import {
  createMusicApiEnv,
  createMusicApiFixture,
  insertCatalogTrack,
} from './helpers/music-api-fixture'

const issuer = 'https://music-song-portal-test.cloudflareaccess.com'
const audience = 'music-song-portal-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  for (const id of ['track-a', 'track-b', 'track-unselected', 'track-inactive']) {
    insertCatalogTrack(fixture.sqlite, { id, active: id !== 'track-inactive' })
  }

  const identity = await authenticatedMusicUser(
    await authority.request({ sub: 'portal-owner', email: 'owner@example.com' }),
    env(),
  )
  ownerId = identity!.userId
  createPlanet('planet-owner', ownerId, 'public')
  addSelection('planet-owner', 'track-a', '2026-09-29T08:00:00.000Z')
  addSelection('planet-owner', 'track-b', '2026-09-29T08:00:00.000Z')
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function env(overrides: Partial<Env> = {}) {
  return createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    ...overrides,
  })
}

function createPlanet(id: string, owner: string, visibility: 'public' | 'private', updatedAt = '2026-09-29T08:00:00.000Z') {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '跟着歌声靠岸', ?, ?, ?)
  `).run(id, owner, id, visibility, updatedAt, updatedAt)
}

function addSelection(planetId: string, trackId: string, selectedAt = '2026-09-29T08:00:00.000Z') {
  const position = (fixture.sqlite.prepare(`
    SELECT count(*) AS count FROM music_planet_tracks WHERE planet_id = ?
  `).get(planetId) as { count: number }).count
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(planetId, trackId, position, position === 0 ? 1 : 0, selectedAt)
}

function addMoment(id: string, planetId: string, trackId: string, visibility: 'public' | 'private', publishedAt: string | null) {
  fixture.sqlite.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z')
  `).run(id, planetId, trackId, `${id} 的留言内容`, visibility, publishedAt)
}

async function createIdentity(subject: string) {
  const identity = await authenticatedMusicUser(
    await authority.request({ sub: subject, email: `${subject}@example.com` }),
    env(),
  )
  return identity!.userId
}

async function getSongPortal(trackId: string, subject = 'portal-owner', overrides: Partial<Env> = {}) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request(`https://moodverse.test/api/music/song-portal?trackId=${encodeURIComponent(trackId)}`, {
    headers: signed.headers,
  })
  return onRequestSongPortal({ request, env: env(overrides) } as never)
}

test('song portal never returns candidates without a verified Cloudflare Access identity', async () => {
  const response = await onRequestSongPortal({
    request: new Request('https://moodverse.test/api/music/song-portal?trackId=track-a'),
    env: env(),
  } as never)

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
})

test('song portal falls back without calling the AI gateway when its origin bearer is unset', async () => {
  const candidateOwner = await createIdentity('missing-gateway-token-owner')
  createPlanet('planet-missing-gateway-token', candidateOwner, 'public')
  addSelection('planet-missing-gateway-token', 'track-a')

  const originalFetch = globalThis.fetch
  let modelCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(input.toString()).origin === issuer) return originalFetch(input, init)
    modelCalls += 1
    return Response.json({ model: { name: 'qwen3-local', version: '0.6b' }, output: { ranking: [] } })
  }))

  const response = await getSongPortal('track-a', 'portal-owner', {
    MUSIC_AI_SONG_PORTAL_URL: 'https://ai.example/v1/song-portal/rank',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  })
  const body = await response.json() as { ranking: Record<string, unknown> }

  expect(response.status).toBe(200)
  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null })
  expect(modelCalls).toBe(0)
  expect(fixture.sqlite.prepare(`SELECT count(*) AS count FROM music_ai_tasks WHERE kind = 'song_portal_rank'`).get())
    .toEqual({ count: 0 })
})

test('song portal only searches a track actively selected or publicly shared by the requesting owner', async () => {
  const otherOwner = await createIdentity('other-owner')
  createPlanet('planet-other', otherOwner, 'public')
  addSelection('planet-other', 'track-unselected')

  fixture.sqlite.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES ('owner-private-moment', 'planet-owner', 'track-unselected', 'private', 'private', NULL,
            '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z')
  `).run()
  const privateOnly = await getSongPortal('track-unselected')
  expect(privateOnly.status).toBe(403)
  expect(await privateOnly.json()).toEqual({ error: 'TRACK_NOT_IN_ACTIVE_SELECTION_OR_PUBLIC_MOMENT' })

  addMoment('owner-public-moment', 'planet-owner', 'track-unselected', 'public', '2026-09-29T12:00:00.000Z')
  const publicMoment = await getSongPortal('track-unselected')
  expect(publicMoment.status).toBe(200)
  expect(await publicMoment.json()).toMatchObject({
    trackId: 'track-unselected',
    matches: [{ planetId: 'planet-other', matchSource: 'active_selection' }],
  })
})

test('song portal returns only exact-track evidence from other public planets without exposing private content', async () => {
  const selectedOwner = await createIdentity('selected-owner')
  createPlanet('planet-selected', selectedOwner, 'public')
  addSelection('planet-selected', 'track-a', '2026-09-29T12:00:00.000Z')
  addMoment('public-selected-moment', 'planet-selected', 'track-a', 'public', '2026-09-29T10:00:00.000Z')

  const momentOwner = await createIdentity('moment-owner')
  createPlanet('planet-moment-only', momentOwner, 'public')
  addSelection('planet-moment-only', 'track-b')
  addMoment('public-match', 'planet-moment-only', 'track-a', 'public', '2026-09-29T11:00:00.000Z')
  addMoment('private-leak-sentinel', 'planet-moment-only', 'track-a', 'private', null)

  const privateOwner = await createIdentity('private-owner')
  createPlanet('planet-private', privateOwner, 'private')
  addSelection('planet-private', 'track-a')

  const privateMomentOwner = await createIdentity('private-moment-owner')
  createPlanet('planet-private-moment', privateMomentOwner, 'public')
  addSelection('planet-private-moment', 'track-b')
  addMoment('private-only-match', 'planet-private-moment', 'track-a', 'private', null)

  const lookalikeOwner = await createIdentity('lookalike-owner')
  createPlanet('planet-same-artist-only', lookalikeOwner, 'public')
  addSelection('planet-same-artist-only', 'track-b')

  const inactiveOwner = await createIdentity('inactive-owner')
  createPlanet('planet-inactive-track', inactiveOwner, 'public')
  addSelection('planet-inactive-track', 'track-inactive')
  fixture.sqlite.prepare("UPDATE music_track_catalog SET is_active = 0 WHERE id = 'track-inactive'").run()

  const response = await getSongPortal('track-a')
  const body = await response.json() as { trackId: string; matches: Array<Record<string, unknown>> }

  expect(response.status).toBe(200)
  expect(body).toEqual({
    trackId: 'track-a',
    ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null },
    matches: [
      {
        planetId: 'planet-selected',
        displayName: 'planet-selected',
        tagline: '跟着歌声靠岸',
        matchSource: 'active_selection_and_public_moment',
        selectedAt: '2026-09-29T12:00:00.000Z',
        latestPublicMomentAt: '2026-09-29T10:00:00.000Z',
        rankScore: null,
        reasonCode: 'shared_selection_and_moment',
        visual: expect.objectContaining({ schemaVersion: 3, seed: 'planet-selected' }),
      },
      {
        planetId: 'planet-moment-only',
        displayName: 'planet-moment-only',
        tagline: '跟着歌声靠岸',
        matchSource: 'public_moment',
        selectedAt: null,
        latestPublicMomentAt: '2026-09-29T11:00:00.000Z',
        rankScore: null,
        reasonCode: 'shared_public_moment',
        visual: expect.objectContaining({ schemaVersion: 3, seed: 'planet-moment-only' }),
      },
    ],
  })
  expect(JSON.stringify(body)).not.toContain('private-leak-sentinel')
  expect(JSON.stringify(body)).not.toContain('private-only-match')
  expect(JSON.stringify(body)).not.toContain('@example.com')
  expect(JSON.stringify(body)).not.toContain('provider_track_id')
})

test('song portal rejects malformed and inactive canonical track IDs without searching by title or artist', async () => {
  const malformed = await getSongPortal('  ')
  expect(malformed.status).toBe(400)
  expect(await malformed.json()).toEqual({ error: 'INVALID_TRACK_ID' })

  const inactive = await getSongPortal('track-inactive')
  expect(inactive.status).toBe(404)
  expect(await inactive.json()).toEqual({ error: 'TRACK_NOT_AVAILABLE' })
})

test('song portal returns every eligible non-primary match beyond the first hundred', async () => {
  const expectedIds: string[] = []
  for (let index = 0; index < 205; index += 1) {
    const id = `full-song-${String(index).padStart(3, '0')}`
    fixture.sqlite.prepare("INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?, ?, 'now', 'now')").run(id, `hash-${id}`)
    createPlanet(id, id, index === 0 ? 'private' : 'public')
    addSelection(id, 'track-unselected')
    addSelection(id, 'track-b')
    if (index > 2) expectedIds.push(id)
  }
  fixture.sqlite.prepare("INSERT INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, 'full-song-001', 'now'), ('full-song-002', ?, 'now')").run(ownerId, ownerId)
  const response = await getSongPortal('track-b')
  const body = await response.json() as { matches: Array<{ planetId: string; matchSource: string }> }
  expect(response.status).toBe(200)
  expect(body.matches.map(item => item.planetId)).toEqual(expectedIds)
  expect(body.matches.every(item => item.matchSource === 'active_selection')).toBe(true)
})

test('switching either primary track leaves non-primary song matching eligibility unchanged', async () => {
  const candidateOwner = await createIdentity('secondary-song-owner')
  createPlanet('secondary-song-planet', candidateOwner, 'public')
  addSelection('secondary-song-planet', 'track-unselected')
  addSelection('secondary-song-planet', 'track-b')
  const matches = async () => {
    const body = await (await getSongPortal('track-b')).json() as { matches: Array<{ planetId: string; matchSource: string }> }
    return body.matches.map(({ planetId, matchSource }) => ({ planetId, matchSource }))
  }
  expect(await matches()).toEqual([{ planetId: 'secondary-song-planet', matchSource: 'active_selection' }])
  for (const planetId of ['planet-owner', 'secondary-song-planet']) {
    fixture.sqlite.prepare('UPDATE music_planet_tracks SET is_primary = 0 WHERE planet_id = ?').run(planetId)
    fixture.sqlite.prepare("UPDATE music_planet_tracks SET is_primary = 1 WHERE planet_id = ? AND track_id = 'track-b'").run(planetId)
    expect(await matches()).toEqual([{ planetId: 'secondary-song-planet', matchSource: 'active_selection' }])
  }
})

test('same title and artist with a different canonical track ID does not create a false song match', async () => {
  fixture.sqlite.prepare("UPDATE music_track_catalog SET title = '同名曲', artist_name = '同名艺人' WHERE id IN ('track-a', 'track-unselected')").run()
  const otherOwner = await createIdentity('same-metadata-owner')
  createPlanet('same-metadata-planet', otherOwner, 'public')
  addSelection('same-metadata-planet', 'track-unselected')
  const response = await getSongPortal('track-a')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ trackId: 'track-a', matches: [] })
})

test('song portal sends only exact public candidates to the local model and applies its validated ranking', async () => {
  const momentOwner = await createIdentity('ai-moment-owner')
  createPlanet('planet-ai-moment', momentOwner, 'public')
  addSelection('planet-ai-moment', 'track-b')
  addMoment('public-ai-moment', 'planet-ai-moment', 'track-a', 'public', '2026-09-29T11:00:00.000Z')
  addMoment('private-ai-sentinel', 'planet-ai-moment', 'track-a', 'private', null)

  const selectedOwner = await createIdentity('ai-selected-owner')
  createPlanet('planet-ai-selected', selectedOwner, 'public')
  addSelection('planet-ai-selected', 'track-a', '2026-09-29T09:00:00.000Z')
  addMoment('selected-public-moment', 'planet-ai-selected', 'track-a', 'public', '2026-09-29T10:00:00.000Z')

  const originalFetch = globalThis.fetch
  let gatewayRequest: { url: string; init: RequestInit } | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    gatewayRequest = { url: url.toString(), init: init ?? {} }
    return Response.json({
      model: { name: 'qwen3-embedding-local', version: '0.6b-ml', },
      ranking: [
        { planetId: 'planet-ai-moment', score: 0.93 },
        { planetId: 'planet-ai-selected', score: 0.84 },
      ],
    })
  }))

  const response = await getSongPortal('track-a', 'portal-owner', {
    MUSIC_AI_SONG_PORTAL_URL: 'https://ai.example/v1/song-portal/rank',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as { ranking: Record<string, any>; matches: Array<Record<string, any>> }

  expect(response.status).toBe(200)
  expect(gatewayRequest?.url).toBe('https://ai.example/v1/song-portal/rank')
  const headers = new Headers(gatewayRequest?.init.headers)
  expect(headers.get('Cf-Access-Client-Id')).toBe('access-client-id')
  expect(headers.get('Cf-Access-Client-Secret')).toBe('access-client-secret')
  expect(headers.get('Authorization')).toBe('Bearer test-gateway-secret')
  const payload = JSON.parse(String(gatewayRequest?.init.body)) as Record<string, any>
  expect(payload).toMatchObject({
    schemaVersion: 1,
    track: { id: 'track-a', title: '歌曲 track-a', artistName: '艺人' },
    candidates: [
      { planetId: 'planet-ai-moment', matchSource: 'public_moment', publicMomentText: 'public-ai-moment 的留言内容' },
      { planetId: 'planet-ai-selected', matchSource: 'active_selection_and_public_moment', publicMomentText: 'selected-public-moment 的留言内容' },
    ],
  })
  expect(JSON.stringify(payload)).not.toContain('private-ai-sentinel')
  expect(JSON.stringify(payload)).not.toContain('owner@example.com')
  expect(JSON.stringify(payload)).not.toContain('officialUrl')
  expect(body.ranking).toMatchObject({ mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-ml' } })
  expect(body.matches.map(({ planetId }) => planetId)).toEqual(['planet-ai-moment', 'planet-ai-selected'])
  expect(body.matches[0]).toMatchObject({ rankScore: 0.93, reasonCode: 'shared_public_moment' })
  expect(body.matches[1]).toMatchObject({ rankScore: 0.84, reasonCode: 'shared_selection_and_moment' })
  expect(fixture.sqlite.prepare(`
    SELECT status, model_name, model_version, schema_version, input_hash, error_code
    FROM music_ai_tasks WHERE kind = 'song_portal_rank'
  `).get()).toMatchObject({
    status: 'succeeded', model_name: 'qwen3-embedding-local', model_version: '0.6b-ml',
    schema_version: 1, error_code: null,
  })
  expect((fixture.sqlite.prepare(`
    SELECT input_hash FROM music_ai_tasks WHERE kind = 'song_portal_rank'
  `).get() as { input_hash: string }).input_hash).toMatch(/^[a-f0-9]{64}$/)
})

test('song portal allows the measured cold-start duration before falling back', async () => {
  const candidateOwner = await createIdentity('cold-rank-candidate')
  createPlanet('planet-cold-rank', candidateOwner, 'public')
  addSelection('planet-cold-rank', 'track-a')

  const originalFetch = globalThis.fetch
  let timeoutMs = 0
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    timeoutMs = milliseconds
    return new AbortController().signal
  })
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    return Promise.resolve(Response.json({
      model: { name: 'qwen3-local', version: '4b-q4' },
      ranking: [{ planetId: 'planet-cold-rank', score: 0.82 }],
    }))
  }))

  const pendingResponse = getSongPortal('track-a', 'portal-owner', {
    MUSIC_AI_SONG_PORTAL_URL: 'https://ai.example/v1/song-portal/rank',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const response = await pendingResponse
  const body = await response.json() as { ranking: Record<string, unknown>; matches: Array<Record<string, unknown>> }

  expect(timeoutMs).toBeGreaterThanOrEqual(31_000)
  expect(body.ranking).toMatchObject({ mode: 'model', status: 'ready' })
  expect(body.matches[0]).toMatchObject({ planetId: 'planet-cold-rank', rankScore: 0.82 })
})

test('song portal rejects model-provided reason codes even when they match server evidence', async () => {
  const selectedOwner = await createIdentity('invalid-rank-owner')
  createPlanet('planet-valid-candidate', selectedOwner, 'public')
  addSelection('planet-valid-candidate', 'track-a', '2026-09-29T09:00:00.000Z')

  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    return Response.json({
      model: { name: 'qwen3-local', version: '4b-q4' },
      ranking: [
        { planetId: 'planet-valid-candidate', score: 0.9, reasonCode: 'shared_song_selection' },
      ],
    })
  }))

  const response = await getSongPortal('track-a', 'portal-owner', {
    MUSIC_AI_SONG_PORTAL_URL: 'https://ai.example/v1/song-portal/rank',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as { ranking: Record<string, unknown>; matches: Array<Record<string, unknown>> }

  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'invalid_output' })
  expect(body.matches).toEqual([{
    planetId: 'planet-valid-candidate', displayName: 'planet-valid-candidate', tagline: '跟着歌声靠岸',
    matchSource: 'active_selection', selectedAt: '2026-09-29T09:00:00.000Z', latestPublicMomentAt: null,
    rankScore: null, reasonCode: 'shared_song_selection',
    visual: expect.objectContaining({ schemaVersion: 3, seed: 'planet-valid-candidate' }),
  }])
  expect(fixture.sqlite.prepare(`SELECT status, error_code FROM music_ai_tasks WHERE kind = 'song_portal_rank'`)
    .get()).toEqual({ status: 'failed', error_code: 'AI_RESULT_INVALID' })
})

test.each(['visual-only', 'private', 'viewer-block', 'owner-block'])('song portal refreshes exact saved visuals and eligibility after %s during model inference', async change => {
  const changingOwner = await createIdentity('visual-changing-owner')
  createPlanet('visual-changing', changingOwner, 'public')
  addSelection('visual-changing', 'track-a')
  const stableOwner = await createIdentity('visual-stable-owner')
  createPlanet('visual-stable', stableOwner, 'public')
  addSelection('visual-stable', 'track-a')
  const oldVisual = createDitherSpec({ planetId: 'visual-stable', tracks: [], overrides: { motif: 'flower', blue: .8 } })
  const latestVisual = createDitherSpec({ planetId: 'visual-stable', tracks: [], overrides: { motif: 'prism', pink: .91 } })
  fixture.sqlite.prepare("UPDATE music_planets SET visual_json = ? WHERE id = 'visual-stable'").run(JSON.stringify(oldVisual))
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(input.toString()).origin === issuer) return originalFetch(input, init)
    expect(String(init?.body)).not.toContain('overrides')
    if (change === 'private') fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE id = 'visual-changing'").run()
    else if (change !== 'visual-only') fixture.sqlite.prepare('INSERT INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?)')
      .run(change === 'viewer-block' ? ownerId : changingOwner, change === 'viewer-block' ? changingOwner : ownerId, 'now')
    fixture.sqlite.prepare("UPDATE music_planets SET visual_json = ? WHERE id = 'visual-stable'").run(JSON.stringify(latestVisual))
    return Response.json({ model: { name: 'qwen3-local', version: '4b-q4' }, ranking: [
      { planetId: 'visual-changing', score: .9 }, { planetId: 'visual-stable', score: .8 },
    ] })
  }))
  const response = await getSongPortal('track-a', 'portal-owner', {
    MUSIC_AI_SONG_PORTAL_URL: 'https://ai.example/v1/song-portal/rank',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id', MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as { ranking: { mode: string; status: string }; matches: Array<{ planetId: string; visual: DitherPlanetSpec }> }
  expect(body.matches.find(item => item.planetId === 'visual-stable')?.visual).toEqual(latestVisual)
  if (change === 'visual-only') {
    expect(body.matches).toHaveLength(2)
    expect(body.ranking).toMatchObject({ mode: 'model', status: 'ready' })
  } else {
    expect(body.matches).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('visual-changing')
    expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'input_changed' })
  }
})
