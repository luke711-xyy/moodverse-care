import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser, type Env } from '../functions/_shared'
import { scheduled as runScheduled } from '../cron-worker'
import { onRequestGet as getBottles, onRequestPost as createBottle } from '../functions/api/me/drift-bottles'
import { onRequestGet as getBottle, onRequestPatch as updateBottle } from '../functions/api/me/drift-bottles/[id]'
import { onRequestPost as addComment } from '../functions/api/me/drift-bottles/[id]/comments'
import { onRequestDelete as unlikeComment, onRequestPost as likeComment } from '../functions/api/me/drift-bottles/[id]/comments/[commentId]/like'
import { onRequestGet as getSocialSettings, onRequestPatch as patchSocialSettings } from '../functions/api/me/social-settings'
import { onRequestDelete as deleteMoment } from '../functions/api/me/music-planet/moments/[id]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-drift-test.cloudflareaccess.com'
const audience = 'music-drift-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let senderId: string

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  insertCatalogTrack(fixture.sqlite, { id: 'bottle-song-a' })
  insertCatalogTrack(fixture.sqlite, { id: 'bottle-song-b' })
  senderId = await identityFor('bottle-sender')
  createPlanet('bottle-sender-planet', senderId, 'public', 'bottle-song-a')
})
afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function env(overrides: Partial<Env> = {}) {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience, ...overrides })
}

function createPlanet(id: string, userId: string, visibility: 'public' | 'private', trackId?: string) {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '继续听下去。', ?, ?, ?)
  `).run(id, userId, id, visibility, new Date().toISOString(), new Date().toISOString())
  if (trackId) fixture.sqlite.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, 0, 1, ?)
  `).run(id, trackId, new Date().toISOString())
}

function addMoment(id: string, visibility: 'public' | 'private') {
  fixture.sqlite.prepare(`
    INSERT INTO music_moments
      (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES (?, 'bottle-sender-planet', 'bottle-song-a', '这段文字只在明确分享后进入漂流瓶。', ?, ?, ?, ?)
  `).run(id, visibility, visibility === 'public' ? new Date().toISOString() : null,
    new Date().toISOString(), new Date().toISOString())
}

async function identityFor(subject: string) {
  const request = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return (await authenticatedMusicUser(request, env()))!.userId
}

async function call(
  subject: string,
  path: string,
  handler: PagesFunction<Env>,
  options: { method?: string; body?: unknown; params?: Record<string, string>; env?: Partial<Env> } = {},
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  const request = new Request(`https://moodverse.test${path}`, {
    method: options.method ?? 'GET', headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
  return handler({ request, env: env(options.env), params: options.params ?? {}, waitUntil: () => undefined } as never)
}

async function createSongBottle(messageText = '', environment: Partial<Env> = {}) {
  return call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'song', trackId: 'bottle-song-a' }, messageText },
    env: environment,
  })
}

test('drift bottles require a verified identity and the daily inbox preference defaults to enabled', async () => {
  const unauthenticated = await getBottles({ request: new Request('https://moodverse.test/api/me/drift-bottles'), env: env() } as never)
  expect(unauthenticated.status).toBe(401)

  const initial = await call('bottle-sender', '/api/me/social-settings', getSocialSettings)
  expect(await initial.json()).toEqual({ allowFriendRequests: true, allowDriftBottles: true })

  const changed = await call('bottle-sender', '/api/me/social-settings', patchSocialSettings, {
    method: 'PATCH', body: { allowDriftBottles: false },
  })
  expect(await changed.json()).toEqual({ allowFriendRequests: true, allowDriftBottles: false })
})

test('a bottle is delivered to one eligible random recipient and the sender may create only one per UTC day', async () => {
  const eligibleId = await identityFor('bottle-recipient')
  createPlanet('bottle-recipient-planet', eligibleId, 'public', 'bottle-song-b')
  const privateId = await identityFor('bottle-private-recipient')
  createPlanet('bottle-private-planet', privateId, 'private', 'bottle-song-b')
  const optedOutId = await identityFor('bottle-opted-out')
  createPlanet('bottle-opted-out-planet', optedOutId, 'public', 'bottle-song-b')
  fixture.sqlite.prepare(`INSERT INTO music_drift_preferences (user_id, allow_receiving, updated_at) VALUES (?, 0, ?)`).run(optedOutId, new Date().toISOString())

  const created = await createSongBottle('沿着这首歌继续漂流。')
  const body = await created.json() as { bottle: { id: string; status: string; topic: { type: string; trackId: string } }; sentToday: boolean }
  expect(created.status).toBe(201)
  expect(body).toMatchObject({ sentToday: true, bottle: { status: 'delivered', topic: { type: 'song', trackId: 'bottle-song-a' } } })
  const current = fixture.sqlite.prepare(`SELECT recipient_user_id, status FROM music_drift_deliveries`).get() as { recipient_user_id: string; status: string }
  expect(current).toEqual({ recipient_user_id: eligibleId, status: 'unread' })
  expect([senderId, privateId, optedOutId]).not.toContain(current.recipient_user_id)
  expect(JSON.stringify(body)).not.toContain(eligibleId)

  const duplicate = await createSongBottle()
  expect(duplicate.status).toBe(409)
  expect(await duplicate.json()).toEqual({ error: 'DAILY_BOTTLE_LIMIT' })
})

test('drift bottle keeps lexical routing when the AI gateway bearer is unset', async () => {
  const candidateA = await identityFor('bottle-no-token-a')
  createPlanet('bottle-no-token-a-planet', candidateA, 'public', 'bottle-song-b')
  const candidateB = await identityFor('bottle-no-token-b')
  createPlanet('bottle-no-token-b-planet', candidateB, 'public', 'bottle-song-b')

  const originalFetch = globalThis.fetch
  let modelCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(input.toString()).origin === issuer) return originalFetch(input, init)
    modelCalls += 1
    return Response.json({ model: { name: 'qwen3-local', version: '0.6b' }, embeddings: [] })
  }))

  const response = await createSongBottle('', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
  })

  expect(response.status).toBe(201)
  expect((await response.json()).bottle.status).toBe('delivered')
  expect(modelCalls).toBe(0)
  expect(fixture.sqlite.prepare(`SELECT count(*) AS count FROM music_ai_tasks WHERE kind = 'bottle_embedding'`).get())
    .toEqual({ count: 0 })
})

test('drift bottle sends embedding requests with the server-only origin bearer', async () => {
  const candidateA = await identityFor('bottle-ai-a')
  createPlanet('bottle-ai-a-planet', candidateA, 'public', 'bottle-song-b')
  const candidateB = await identityFor('bottle-ai-b')
  createPlanet('bottle-ai-b-planet', candidateB, 'public', 'bottle-song-b')

  const originalFetch = globalThis.fetch
  let gatewayHeaders: Headers | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return originalFetch(input, init)
    gatewayHeaders = new Headers(init?.headers)
    const payload = JSON.parse(String(init?.body)) as { inputs: Array<{ id: string }> }
    return Response.json({
      model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' },
      embeddings: payload.inputs.map(({ id }) => ({ id, vector: [1, 0, 0, 0, 0, 0, 0, 0] })),
    })
  }))

  const response = await createSongBottle('沿着这首歌继续漂流。', {
    MUSIC_AI_EMBEDDING_URL: 'https://embedding.example/v1/embed',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  })

  expect(response.status).toBe(201)
  expect(gatewayHeaders?.get('Authorization')).toBe('Bearer test-gateway-secret')
  expect(fixture.sqlite.prepare(`SELECT status, model_name FROM music_ai_tasks WHERE kind = 'bottle_embedding'`).get())
    .toMatchObject({ status: 'succeeded', model_name: 'qwen3-embedding-local' })
})

test('turning off future bottle reception does not revoke a bottle already in the inbox', async () => {
  const recipientId = await identityFor('bottle-existing-recipient')
  createPlanet('bottle-existing-recipient-planet', recipientId, 'public', 'bottle-song-b')
  const created = await createSongBottle()
  const { bottle } = await created.json() as { bottle: { id: string } }

  const optedOut = await call('bottle-existing-recipient', '/api/me/social-settings', patchSocialSettings, {
    method: 'PATCH', body: { allowDriftBottles: false },
  })
  expect(optedOut.status).toBe(200)
  const opened = await call('bottle-existing-recipient', `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'open' }, params: { id: bottle.id },
  })
  expect(opened.status).toBe(200)
})

test('a bottle may only carry an active song, a safe linked info item, or the sender’s public Moment', async () => {
  const privateMomentId = 'bottle-private-moment'
  addMoment(privateMomentId, 'private')
  const rejectedMoment = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: privateMomentId }, messageText: '' },
  })
  expect(rejectedMoment.status).toBe(400)
  expect(await rejectedMoment.json()).toEqual({ error: 'MOMENT_NOT_SHAREABLE' })

  const rejectedUrl = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'info', title: 'A source', url: 'http://unsafe.example', summary: '' }, messageText: '' },
  })
  expect(rejectedUrl.status).toBe(400)
  expect(await rejectedUrl.json()).toEqual({ error: 'INVALID_BOTTLE_TOPIC' })

  addMoment('bottle-public-moment', 'public')
  const publicMoment = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: 'bottle-public-moment' }, messageText: '' },
  })
  expect(publicMoment.status).toBe(201)
})

test('a public Moment from a private planet cannot be shared through a drift bottle', async () => {
  addMoment('bottle-moment-private-planet', 'public')
  fixture.sqlite.prepare(`UPDATE music_planets SET visibility = 'private' WHERE id = 'bottle-sender-planet'`).run()

  const response = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: 'bottle-moment-private-planet' }, messageText: '' },
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'MOMENT_NOT_SHAREABLE' })
  expect(fixture.sqlite.prepare(`SELECT id FROM music_drift_bottles`).get()).toBeUndefined()
})

test('a recipient must open a bottle before commenting or releasing, then the bottle moves to a different recipient', async () => {
  const recipientA = await identityFor('bottle-recipient-a')
  createPlanet('bottle-recipient-a-planet', recipientA, 'public', 'bottle-song-b')
  const recipientB = await identityFor('bottle-recipient-b')
  createPlanet('bottle-recipient-b-planet', recipientB, 'public', 'bottle-song-b')

  const created = await createSongBottle('继续传给下一个人。')
  const { bottle } = await created.json() as { bottle: { id: string } }
  const firstDelivery = fixture.sqlite.prepare(`SELECT id, recipient_user_id FROM music_drift_deliveries`).get() as { id: string; recipient_user_id: string }
  const firstSubject = firstDelivery.recipient_user_id === recipientA ? 'bottle-recipient-a' : 'bottle-recipient-b'
  const secondRecipient = firstDelivery.recipient_user_id === recipientA ? recipientB : recipientA

  const commentTooEarly = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}/comments`, addComment, {
    method: 'POST', body: { contentText: '未打开不能评论。' }, params: { id: bottle.id },
  })
  expect(commentTooEarly.status).toBe(409)

  const opened = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'open' }, params: { id: bottle.id },
  })
  expect(opened.status).toBe(200)
  expect(await opened.json()).toMatchObject({ delivery: { status: 'read' } })

  const comment = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}/comments`, addComment, {
    method: 'POST', body: { contentText: '我也想把这首歌分享给下个人。' }, params: { id: bottle.id },
  })
  const { comment: savedComment } = await comment.json() as { comment: { id: string; likeCount: number } }
  expect(comment.status).toBe(201)
  expect(savedComment.likeCount).toBe(0)

  const liked = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}/comments/${savedComment.id}/like`, likeComment, {
    method: 'POST', params: { id: bottle.id, commentId: savedComment.id },
  })
  expect(await liked.json()).toEqual({ liked: true, likeCount: 1 })
  const duplicateLike = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}/comments/${savedComment.id}/like`, likeComment, {
    method: 'POST', params: { id: bottle.id, commentId: savedComment.id },
  })
  expect(await duplicateLike.json()).toEqual({ liked: true, likeCount: 1 })

  const releasedTooEarlyByOther = await call('bottle-sender', `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'release' }, params: { id: bottle.id },
  })
  expect(releasedTooEarlyByOther.status).toBe(404)

  const released = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'release' }, params: { id: bottle.id },
  })
  expect(released.status).toBe(200)
  expect(fixture.sqlite.prepare(`SELECT recipient_user_id, status FROM music_drift_deliveries WHERE status = 'unread'`).get())
    .toEqual({ recipient_user_id: secondRecipient, status: 'unread' })

  const recipientRead = await call(firstSubject, `/api/me/drift-bottles/${bottle.id}`, getBottle, { params: { id: bottle.id } })
  expect(recipientRead.status).toBe(404)
  const nextRecipient = secondRecipient === recipientA ? 'bottle-recipient-a' : 'bottle-recipient-b'
  const openedByNextRecipient = await call(nextRecipient, `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'open' }, params: { id: bottle.id },
  })
  expect(openedByNextRecipient.status).toBe(200)
  const secondRead = await call(nextRecipient, `/api/me/drift-bottles/${bottle.id}`, getBottle, { params: { id: bottle.id } })
  expect(secondRead.status).toBe(200)
  expect(await secondRead.json()).toMatchObject({ comments: [{ contentText: '我也想把这首歌分享给下个人。', likeCount: 1 }] })

  const nextLiked = await call(nextRecipient, `/api/me/drift-bottles/${bottle.id}/comments/${savedComment.id}/like`, likeComment, {
    method: 'POST', params: { id: bottle.id, commentId: savedComment.id },
  })
  expect(await nextLiked.json()).toEqual({ liked: true, likeCount: 2 })
  const unliked = await call(nextRecipient, `/api/me/drift-bottles/${bottle.id}/comments/${savedComment.id}/like`, unlikeComment, {
    method: 'DELETE', params: { id: bottle.id, commentId: savedComment.id },
  })
  expect(await unliked.json()).toEqual({ liked: false, likeCount: 1 })
})

test('an unread delivery expires after one hour and is re-routed by the scheduled worker', async () => {
  const recipientA = await identityFor('bottle-timeout-a')
  createPlanet('bottle-timeout-a-planet', recipientA, 'public', 'bottle-song-b')
  const recipientB = await identityFor('bottle-timeout-b')
  createPlanet('bottle-timeout-b-planet', recipientB, 'public', 'bottle-song-b')
  const created = await createSongBottle()
  const { bottle } = await created.json() as { bottle: { id: string } }
  const previous = fixture.sqlite.prepare(`SELECT id, recipient_user_id FROM music_drift_deliveries`).get() as { id: string; recipient_user_id: string }
  const nextRecipient = previous.recipient_user_id === recipientA ? recipientB : recipientA
  const expiredAt = new Date(Date.now() - 61 * 60 * 1000).toISOString()
  fixture.sqlite.prepare(`UPDATE music_drift_deliveries SET expires_at = ? WHERE id = ?`).run(expiredAt, previous.id)

  await runScheduled({ scheduledTime: Date.UTC(2026, 0, 1, 0, 5), cron: '*/5 * * * *' } as ScheduledEvent, env())

  expect(fixture.sqlite.prepare(`SELECT status FROM music_drift_deliveries WHERE id = ?`).get(previous.id)).toEqual({ status: 'expired' })
  expect(fixture.sqlite.prepare(`SELECT recipient_user_id, status FROM music_drift_deliveries WHERE bottle_id = ? AND status = 'unread'`).get(bottle.id))
    .toEqual({ recipient_user_id: nextRecipient, status: 'unread' })
})

test('a public Moment turned private before opening stops the bottle without exposing its text', async () => {
  const recipientId = await identityFor('bottle-moment-recipient')
  createPlanet('bottle-moment-recipient-planet', recipientId, 'public', 'bottle-song-b')
  addMoment('moment-turns-private', 'public')
  const created = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: 'moment-turns-private' }, messageText: '' },
  })
  const { bottle } = await created.json() as { bottle: { id: string } }
  fixture.sqlite.prepare(`UPDATE music_moments SET visibility = 'private', published_at = NULL WHERE id = 'moment-turns-private'`).run()

  const recipientSubject = 'bottle-moment-recipient'
  const opened = await call(recipientSubject, `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'open' }, params: { id: bottle.id },
  })
  expect(opened.status).toBe(410)
  expect(await opened.json()).toEqual({ error: 'BOTTLE_CONTENT_UNAVAILABLE' })
  expect(fixture.sqlite.prepare(`SELECT status FROM music_drift_bottles WHERE id = ?`).get(bottle.id)).toEqual({ status: 'unavailable' })
})

test('a Moment bottle stops when its parent planet becomes private before opening', async () => {
  const recipientId = await identityFor('bottle-private-planet-recipient')
  createPlanet('bottle-private-planet-recipient-planet', recipientId, 'public', 'bottle-song-b')
  addMoment('bottle-parent-turns-private', 'public')
  const created = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: 'bottle-parent-turns-private' }, messageText: '' },
  })
  const { bottle } = await created.json() as { bottle: { id: string } }
  fixture.sqlite.prepare(`UPDATE music_planets SET visibility = 'private' WHERE id = 'bottle-sender-planet'`).run()

  const opened = await call('bottle-private-planet-recipient', `/api/me/drift-bottles/${bottle.id}`, updateBottle, {
    method: 'PATCH', body: { action: 'open' }, params: { id: bottle.id },
  })

  expect(opened.status).toBe(410)
  expect(await opened.json()).toEqual({ error: 'BOTTLE_CONTENT_UNAVAILABLE' })
  expect(fixture.sqlite.prepare(`SELECT status FROM music_drift_bottles WHERE id = ?`).get(bottle.id)).toEqual({ status: 'unavailable' })
  expect(fixture.sqlite.prepare(`SELECT status FROM music_drift_deliveries WHERE bottle_id = ?`).get(bottle.id)).toEqual({ status: 'expired' })
})

test('deleting a Moment safely stops its bottle and clears the foreign key', async () => {
  const recipientId = await identityFor('bottle-deleted-moment-recipient')
  createPlanet('bottle-deleted-moment-recipient-planet', recipientId, 'public', 'bottle-song-b')
  addMoment('bottle-deleted-moment', 'public')
  const created = await call('bottle-sender', '/api/me/drift-bottles', createBottle, {
    method: 'POST', body: { topic: { type: 'moment', momentId: 'bottle-deleted-moment' }, messageText: '' },
  })
  const { bottle } = await created.json() as { bottle: { id: string } }

  const deleted = await call('bottle-sender', '/api/me/music-planet/moments/bottle-deleted-moment', deleteMoment, {
    method: 'DELETE', params: { id: 'bottle-deleted-moment' },
  })
  expect(deleted.status).toBe(200)
  expect(fixture.sqlite.prepare(`SELECT status, moment_id FROM music_drift_bottles WHERE id = ?`).get(bottle.id))
    .toEqual({ status: 'unavailable', moment_id: null })
  expect(fixture.sqlite.prepare(`SELECT status FROM music_drift_deliveries WHERE bottle_id = ?`).get(bottle.id))
    .toEqual({ status: 'expired' })
})
