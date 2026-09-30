import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestGet as onRequestDiscovery } from '../functions/api/music/discovery'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-discovery-test.cloudflareaccess.com'
const audience = 'music-discovery-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  for (const track of [
    { id: 'owner-song', title: '夜航' },
    { id: 'match-song', title: '雾中海岸' },
    { id: 'unrelated-song', title: '鼓点实验' },
    { id: 'inactive-song', title: '下架曲目', active: false },
  ]) insertCatalogTrack(fixture.sqlite, track)

  fixture.sqlite.prepare("UPDATE music_track_catalog SET genres_json = '[\"ambient\"]', mood_tags_json = '[\"calm\"]'").run()
  fixture.sqlite.prepare("UPDATE music_track_catalog SET genres_json = '[\"metal\"]', mood_tags_json = '[\"energetic\"]' WHERE id = 'unrelated-song'").run()

  ownerId = await createIdentity('roam-owner')
  createPlanet('planet-owner', ownerId, 'public')
  addSelection('planet-owner', 'owner-song')
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

function createPlanet(id: string, owner: string, visibility: 'public' | 'private') {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '沿着歌声继续漫游。', ?, '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z')
  `).run(id, owner, id, visibility)
}

function addSelection(planetId: string, trackId: string) {
  const position = (fixture.sqlite.prepare('SELECT count(*) AS count FROM music_planet_tracks WHERE planet_id = ?').get(planetId) as { count: number }).count
  fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, ?, ?, '2026-09-29T08:00:00.000Z')
  `).run(planetId, trackId, position, position === 0 ? 1 : 0)
}

function addMoment(id: string, planetId: string, trackId: string, text: string, visibility: 'public' | 'private') {
  fixture.sqlite.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z')
  `).run(id, planetId, trackId, text, visibility, visibility === 'public' ? '2026-09-29T08:00:00.000Z' : null)
}

async function createIdentity(subject: string) {
  const identity = await authenticatedMusicUser(
    await authority.request({ sub: subject, email: `${subject}@example.com` }),
    env(),
  )
  return identity!.userId
}

async function getDiscovery(subject = 'roam-owner', overrides: Partial<Env> = {}) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request('https://moodverse.test/api/music/discovery', { headers: signed.headers })
  return onRequestDiscovery({ request, env: env(overrides) } as never)
}

test('random discovery requires a verified Cloudflare Access identity', async () => {
  const response = await onRequestDiscovery({
    request: new Request('https://moodverse.test/api/music/discovery'),
    env: env(),
  } as never)

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
})

test('random discovery uses public music signals plus exploration and never returns private planets or private Moments', async () => {
  const matchingOwner = await createIdentity('roam-match')
  createPlanet('planet-match', matchingOwner, 'public')
  addSelection('planet-match', 'match-song')
  addMoment('match-public-moment', 'planet-match', 'match-song', '雨停之后，我想沿着夜航的海岸慢慢走。', 'public')
  addMoment('private-sentinel', 'planet-match', 'match-song', 'PRIVATE_MOMENT_MUST_NEVER_ENTER_DISCOVERY', 'private')

  const unrelatedOwner = await createIdentity('roam-unrelated')
  createPlanet('planet-unrelated', unrelatedOwner, 'public')
  addSelection('planet-unrelated', 'unrelated-song')

  const privateOwner = await createIdentity('roam-private')
  createPlanet('planet-private', privateOwner, 'private')
  addSelection('planet-private', 'match-song')

  const response = await getDiscovery()
  const body = await response.json() as {
    ranking: { mode: string; status: string }
    recommendations: Array<{ planetId: string; displayName: string; reasonCode: string; matchScore: number }>
  }

  expect(response.status).toBe(200)
  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'not_configured' })
  expect(body.recommendations.map((item) => item.planetId)).toContain('planet-match')
  expect(body.recommendations.find((item) => item.planetId === 'planet-match')).toMatchObject({
    reasonCode: 'similar_genre',
    matchScore: expect.any(Number),
  })
  expect(body.recommendations.some((item) => item.planetId === 'planet-unrelated')).toBe(true)
  expect(body.recommendations.find((item) => item.planetId === 'planet-unrelated')?.reasonCode).toBe('random')
  expect(JSON.stringify(body)).not.toContain('planet-owner')
  expect(JSON.stringify(body)).not.toContain('planet-private')
  expect(JSON.stringify(body)).not.toContain('PRIVATE_MOMENT_MUST_NEVER_ENTER_DISCOVERY')
  expect(JSON.stringify(body)).not.toContain('@example.com')
})

test('random discovery returns an honest empty state when there are no other eligible public planets', async () => {
  const response = await getDiscovery()

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    ranking: { mode: 'stable_fallback', status: 'no_candidates', model: null, taskId: null },
    recommendations: [],
  })
})

test('random discovery keeps stable matching when its AI gateway bearer is unset', async () => {
  const candidateOwner = await createIdentity('missing-gateway-token-discovery')
  createPlanet('planet-missing-gateway-token', candidateOwner, 'public')
  addSelection('planet-missing-gateway-token', 'match-song')

  const originalFetch = globalThis.fetch
  let modelCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(input.toString()).origin === issuer) return originalFetch(input, init)
    modelCalls += 1
    return Response.json({ model: { name: 'qwen3-local', version: '0.6b' }, embeddings: [] })
  }))

  const response = await getDiscovery('roam-owner', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  })
  const body = await response.json() as { ranking: Record<string, unknown>; recommendations: unknown[] }

  expect(response.status).toBe(200)
  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null })
  expect(body.recommendations.length).toBeGreaterThan(0)
  expect(modelCalls).toBe(0)
  expect(fixture.sqlite.prepare(`SELECT count(*) AS count FROM music_ai_tasks WHERE kind = 'discovery_embedding'`).get())
    .toEqual({ count: 0 })
})

test('random discovery sends only allowed music signals to the local embedding gateway and persists validated task metadata', async () => {
  addMoment('owner-public-moment', 'planet-owner', 'owner-song', '海风经过夜色，我慢慢往前走。', 'public')
  addMoment('owner-private-sentinel', 'planet-owner', 'owner-song', 'OWNER_PRIVATE_TEXT_MUST_NOT_BE_SENT', 'private')
  const candidateOwner = await createIdentity('roam-ai-candidate')
  createPlanet('planet-ai-match', candidateOwner, 'public')
  addSelection('planet-ai-match', 'match-song')
  addMoment('candidate-public-moment', 'planet-ai-match', 'match-song', '海风经过夜色，脚步也慢下来。', 'public')
  addMoment('candidate-private-sentinel', 'planet-ai-match', 'match-song', 'CANDIDATE_PRIVATE_TEXT_MUST_NOT_BE_SENT', 'private')

  const originalFetch = globalThis.fetch
  let gatewayBody: { model: string; inputs: Array<{ id: string; text: string }> } | undefined
  let gatewayHeaders: Headers | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    gatewayHeaders = new Headers(init?.headers)
    gatewayBody = JSON.parse(String(init?.body)) as typeof gatewayBody
    const embeddings = gatewayBody!.inputs.map(({ id }) => ({
      id,
      vector: id === 'planet:planet-ai-match' ? [1, 0, 0, 0, 0, 0, 0, 0] : [1, 0, 0, 0, 0, 0, 0, 0],
    }))
    return Response.json({ model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' }, embeddings })
  }))

  const response = await getDiscovery('roam-owner', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as {
    ranking: { mode: string; status: string; model: { name: string; version: string }; taskId: string }
    recommendations: Array<{ planetId: string; reasonCode: string; matchScore: number }>
  }

  expect(response.status).toBe(200)
  expect(body.ranking).toMatchObject({ mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' } })
  expect(gatewayHeaders?.get('Authorization')).toBe('Bearer test-gateway-secret')
  expect(body.recommendations[0]).toMatchObject({ planetId: 'planet-ai-match', reasonCode: 'semantic_profile', matchScore: 1 })
  expect(gatewayBody?.model).toBe('qwen3-embedding:0.6b')
  expect(JSON.stringify(gatewayBody)).toContain('海风经过夜色')
  expect(JSON.stringify(gatewayBody)).not.toContain('OWNER_PRIVATE_TEXT_MUST_NOT_BE_SENT')
  expect(JSON.stringify(gatewayBody)).not.toContain('CANDIDATE_PRIVATE_TEXT_MUST_NOT_BE_SENT')
  expect(JSON.stringify(gatewayBody)).not.toContain('@example.com')

  const task = fixture.sqlite.prepare('SELECT status, model_name, model_version, result_json FROM music_ai_tasks WHERE id = ?').get(body.ranking.taskId) as {
    status: string; model_name: string; model_version: string; result_json: string
  }
  expect(task.status).toBe('succeeded')
  expect(task.model_name).toBe('qwen3-embedding-local')
  expect(task.model_version).toBe('0.6b-mlx')
  expect(JSON.parse(task.result_json)).toEqual([{ planetId: 'planet-ai-match', score: 1 }])
})

test('invalid embedding output cannot invent recommendations or prevent the stable fallback', async () => {
  const candidateOwner = await createIdentity('roam-invalid-output')
  createPlanet('planet-invalid-output', candidateOwner, 'public')
  addSelection('planet-invalid-output', 'match-song')

  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    return Response.json({
      model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' },
      embeddings: [{ id: 'query', vector: [1, 0, 0, 0, 0, 0, 0, 0] }],
    })
  }))

  const response = await getDiscovery('roam-owner', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as {
    ranking: { mode: string; status: string; taskId: string }
    recommendations: Array<{ planetId: string }>
  }

  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'invalid_output' })
  expect(body.recommendations).toHaveLength(1)
  expect(body.recommendations[0].planetId).toBe('planet-invalid-output')
  const task = fixture.sqlite.prepare('SELECT status, error_code, result_json FROM music_ai_tasks WHERE id = ?').get(body.ranking.taskId) as {
    status: string; error_code: string; result_json: string | null
  }
  expect(task).toEqual({ status: 'failed', error_code: 'AI_INVALID_OUTPUT', result_json: null })
})

test('a planet made private while embedding is running is removed before recommendations return', async () => {
  const becomingPrivateOwner = await createIdentity('roam-becoming-private')
  createPlanet('planet-becoming-private', becomingPrivateOwner, 'public')
  addSelection('planet-becoming-private', 'match-song')

  const stableOwner = await createIdentity('roam-stable-public')
  createPlanet('planet-stable-public', stableOwner, 'public')
  addSelection('planet-stable-public', 'unrelated-song')

  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE id = 'planet-becoming-private'").run()
    const gatewayInput = JSON.parse(String(init?.body)) as { inputs: Array<{ id: string }> }
    return Response.json({
      model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' },
      embeddings: gatewayInput.inputs.map(({ id }) => ({ id, vector: [1, 0, 0, 0, 0, 0, 0, 0] })),
    })
  }))

  const response = await getDiscovery('roam-owner', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })
  const body = await response.json() as {
    ranking: { mode: string; status: string; taskId: string }
    recommendations: Array<{ planetId: string }>
  }

  expect(body.ranking).toMatchObject({ mode: 'stable_fallback', status: 'input_changed' })
  expect(body.recommendations.map((item) => item.planetId)).toContain('planet-stable-public')
  expect(body.recommendations.map((item) => item.planetId)).not.toContain('planet-becoming-private')
  const task = fixture.sqlite.prepare('SELECT status, error_code, result_json FROM music_ai_tasks WHERE id = ?').get(body.ranking.taskId) as {
    status: string; error_code: string; result_json: string | null
  }
  expect(task).toEqual({ status: 'failed', error_code: 'AI_INPUT_CHANGED', result_json: null })
})
