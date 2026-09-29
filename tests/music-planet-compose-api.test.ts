import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestPost as onRequestCompose } from '../functions/api/me/music-planet/compose'
import { onRequestGet as onRequestGetTask } from '../functions/api/me/music-planet/ai-tasks/[id]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import {
  createMusicApiEnv,
  createMusicApiFixture,
  insertCatalogTrack,
} from './helpers/music-api-fixture'

const issuer = 'https://music-compose-test.cloudflareaccess.com'
const audience = 'music-compose-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string

const expectedVisual = {
  schemaVersion: 1,
  summary: '像夜色里缓慢浮动的蓝色星尘。',
  palette: { surface: '#315f98', ocean: '#102d5c', accent: '#8ec9ed' },
  atmosphere: 'starlit',
  motion: 'drift',
  particleDensity: 0.42,
}

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  for (const id of ['track-a', 'track-b', 'track-c']) insertCatalogTrack(fixture.sqlite, { id })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET genres_json = '["dream pop"]', mood_tags_json = '["calm"]', version_label = 'Live'
    WHERE id = 'track-a'
  `).run()

  const identity = await authenticatedMusicUser(
    await authority.request({ sub: 'composer-owner', email: 'owner@example.com' }),
    env(),
  )
  ownerId = identity!.userId
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, visual_json, created_at, updated_at)
    VALUES ('planet-owner', ?, '夜航者', '跟着歌声靠岸', 'public', '{"schemaVersion":1,"summary":"旧视觉"}',
            '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
  `).run(ownerId)
  for (const [position, trackId] of ['track-a', 'track-b', 'track-c'].entries()) {
    fixture.sqlite.prepare(`
      INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
      VALUES ('planet-owner', ?, ?, ?, '2026-09-01T00:00:00.000Z')
    `).run(trackId, position, position === 0 ? 1 : 0)
  }
  fixture.sqlite.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, photo_url, visibility, published_at, created_at, updated_at)
    VALUES ('moment-public', 'planet-owner', 'track-a', '夜风吹过港口。', 'https://images.example/moment.jpg',
            'public', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
           ('moment-private', 'planet-owner', 'track-b', '绝不能传给访客或公共 AI 的私密内容。', NULL,
            'private', NULL, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
  `).run()
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

async function ownerRequest(method: string, taskId?: string, subject = 'composer-owner') {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return new Request(`https://moodverse.test/api/me/music-planet${taskId ? `/ai-tasks/${taskId}` : '/compose'}`, {
    method,
    headers: signed.headers,
  })
}

async function compose(config: Partial<Env> = {}, subject = 'composer-owner') {
  const request = await ownerRequest('POST', undefined, subject)
  const pending: Promise<unknown>[] = []
  const response = await onRequestCompose({
    request,
    env: env(config),
    waitUntil: (task: Promise<unknown>) => pending.push(task),
  } as never)
  return { response, pending }
}

test('composer requires a verified owner and configured authenticated local gateway before queuing work', async () => {
  const noIdentity = await onRequestCompose({
    request: new Request('https://moodverse.test/api/me/music-planet/compose', { method: 'POST' }),
    env: env({ MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose' }),
    waitUntil: () => undefined,
  } as never)
  expect(noIdentity.status).toBe(401)

  const unconfigured = await compose()
  expect(unconfigured.response.status).toBe(503)
  expect(await unconfigured.response.json()).toEqual({ error: 'AI_GATEWAY_NOT_CONFIGURED' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_ai_tasks').get()).toEqual({ count: 0 })
})

test('composer sends only selected track metadata and public Moments, then stores the validated visual result', async () => {
  const originalFetch = globalThis.fetch
  let gatewayRequest: { url: string; init: RequestInit } | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    gatewayRequest = { url: url.toString(), init: init ?? {} }
    return new Response(JSON.stringify({
      model: { name: 'qwen-local', version: '4b-q4-v1' },
      output: expectedVisual,
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))

  const { response, pending } = await compose({
    MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  })
  const accepted = await response.json() as { task: { id: string; status: string } }
  expect(response.status).toBe(202)
  expect(accepted.task.status).toBe('queued')
  await Promise.all(pending)

  expect(gatewayRequest?.url).toBe('https://ai.example/v1/planet/compose')
  const headers = new Headers(gatewayRequest?.init.headers)
  expect(headers.get('Cf-Access-Client-Id')).toBe('access-client-id')
  expect(headers.get('Cf-Access-Client-Secret')).toBe('access-client-secret')
  const payload = JSON.parse(String(gatewayRequest?.init.body)) as Record<string, any>
  expect(payload).toMatchObject({
    taskId: accepted.task.id,
    schemaVersion: 1,
    planet: { id: 'planet-owner', displayName: '夜航者', tagline: '跟着歌声靠岸' },
    selectedTracks: [
      { id: 'track-a', title: '歌曲 track-a', versionLabel: 'Live', genres: ['dream pop'], moodTags: ['calm'], position: 0, isPrimary: true },
      { id: 'track-b', position: 1, isPrimary: false },
      { id: 'track-c', position: 2, isPrimary: false },
    ],
    publicMoments: [{ id: 'moment-public', trackId: 'track-a', contentText: '夜风吹过港口。' }],
  })
  expect(JSON.stringify(payload)).not.toContain('私密内容')
  expect(JSON.stringify(payload)).not.toContain('photoUrl')
  expect(JSON.stringify(payload)).not.toContain('officialUrl')
  expect(JSON.stringify(payload)).not.toContain('owner@example.com')

  const planet = fixture.sqlite.prepare('SELECT visual_schema_version, visual_json FROM music_planets WHERE id = ?')
    .get('planet-owner') as { visual_schema_version: number; visual_json: string }
  expect(planet.visual_schema_version).toBe(1)
  expect(JSON.parse(planet.visual_json)).toEqual(expectedVisual)
  expect(fixture.sqlite.prepare('SELECT status, model_name, model_version, error_code FROM music_ai_tasks WHERE id = ?')
    .get(accepted.task.id)).toMatchObject({ status: 'succeeded', model_name: 'qwen-local', model_version: '4b-q4-v1', error_code: null })

  const taskRequest = await ownerRequest('GET', accepted.task.id)
  const taskResponse = await onRequestGetTask({ request: taskRequest, env: env(), params: { id: accepted.task.id } } as never)
  expect(taskResponse.status).toBe(200)
  expect(await taskResponse.json()).toMatchObject({ task: { id: accepted.task.id, status: 'succeeded', result: expectedVisual } })
})

test('malformed model output fails closed and cannot replace the previous planet visual', async () => {
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    return new Response(JSON.stringify({
      model: { name: 'qwen-local', version: '4b-q4-v1' },
      output: { ...expectedVisual, particleDensity: 1.8, unsafePrompt: 'expose private notes' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))

  const { response, pending } = await compose({
    MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  })
  const accepted = await response.json() as { task: { id: string } }
  await Promise.all(pending)

  expect(fixture.sqlite.prepare('SELECT visual_json FROM music_planets WHERE id = ?').get('planet-owner'))
    .toEqual({ visual_json: '{"schemaVersion":1,"summary":"旧视觉"}' })
  expect(fixture.sqlite.prepare('SELECT status, error_code FROM music_ai_tasks WHERE id = ?').get(accepted.task.id))
    .toEqual({ status: 'failed', error_code: 'AI_RESULT_INVALID' })
})

test('another Access identity cannot compose or read the owner task', async () => {
  const outsider = await compose({
    MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  }, 'different-subject')
  expect(outsider.response.status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_ai_tasks').get()).toEqual({ count: 0 })

  fixture.sqlite.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version, schema_version, input_hash, created_at, updated_at)
    VALUES ('owner-only-task', ?, 'planet-owner', 'planet_composer', 'succeeded', 'qwen-local', '4b-q4-v1', 1,
            'snapshot-hash', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
  `).run(ownerId)
  const taskRequest = await ownerRequest('GET', 'owner-only-task', 'different-subject')
  const taskResponse = await onRequestGetTask({ request: taskRequest, env: env(), params: { id: 'owner-only-task' } } as never)
  expect(taskResponse.status).toBe(404)
})
