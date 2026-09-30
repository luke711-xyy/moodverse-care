import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { authenticatedMusicUser, type Env } from '../functions/_shared'
import { onRequestPost as createReport } from '../functions/api/me/reports'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-report-test.cloudflareaccess.com'
const audience = 'music-report-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let viewerId: string
let targetId: string

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  insertCatalogTrack(fixture.sqlite, { id: 'report-track' })
  viewerId = await identityFor('report-viewer')
  targetId = await identityFor('report-target')
  createPlanet('report-viewer-planet', viewerId, 'viewer')
  createPlanet('report-target-planet', targetId, 'target')
})
afterEach(() => fixture.close())

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
}

async function identityFor(subject: string) {
  const request = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return (await authenticatedMusicUser(request, env()))!.userId
}

function createPlanet(id: string, userId: string, name = '星球') {
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES (?, ?, ?, '继续听下去。', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(id, userId, name)
}

async function call(
  subject: string,
  body: unknown,
  options: { authenticated?: boolean } = {},
) {
  const signed = options.authenticated === false
    ? new Headers()
    : new Headers((await authority.request({ sub: subject, email: `${subject}@example.com` })).headers)
  signed.set('content-type', 'application/json')
  const request = new Request('https://moodverse.test/api/me/reports', {
    method: 'POST', headers: signed, body: JSON.stringify(body),
  })
  return createReport({ request, env: env() } as never)
}

function addPublicMoment(id: string, visibility: 'public' | 'private' = 'public') {
  fixture.sqlite.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at)
    VALUES (?, 'report-target-planet', 'report-track', '留给今天的一句话。', ?, ?, ?, ?)
  `).run(id, visibility, visibility === 'public' ? '2026-09-30T08:00:00.000Z' : null,
    '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
}

function addReceivedBottle() {
  const timestamp = new Date().toISOString()
  fixture.sqlite.prepare(`
    INSERT INTO music_drift_bottles
      (id, sender_user_id, topic_type, track_id, message_text, created_day_utc, status, created_at, updated_at)
    VALUES ('report-bottle', ?, 'song', 'report-track', '一首歌漂过来了。', ?, 'active', ?, ?)
  `).run(targetId, timestamp.slice(0, 10), timestamp, timestamp)
  fixture.sqlite.prepare(`
    INSERT INTO music_drift_deliveries
      (id, bottle_id, recipient_user_id, hop, status, delivered_at, expires_at)
    VALUES ('report-delivery', 'report-bottle', ?, 1, 'unread', ?, ?)
  `).run(viewerId, timestamp, new Date(Date.now() + 60 * 60 * 1000).toISOString())
  fixture.sqlite.prepare(`
    INSERT INTO music_drift_comments
      (id, bottle_id, delivery_id, author_user_id, content_text, created_at)
    VALUES ('report-comment', 'report-bottle', 'report-delivery', ?, '我也听到了。', ?)
  `).run(targetId, timestamp)
}

test('reports require authentication and validate the exact bounded request shape', async () => {
  const unauthenticated = await call('ignored', { target: { type: 'planet', id: 'report-target-planet' }, reason: 'spam' }, { authenticated: false })
  expect(unauthenticated.status).toBe(401)

  for (const body of [
    { target: { type: 'planet', id: 'report-target-planet' }, reason: 'made_up' },
    { target: { type: 'planet', id: 'report-target-planet', userId: targetId }, reason: 'spam' },
    { target: { type: 'planet', id: 'report-target-planet' }, reason: 'spam', extra: true },
    { target: { type: 'planet', id: 'report-target-planet' }, reason: 'other', detail: 'x'.repeat(501) },
  ]) {
    const response = await call('report-viewer', body)
    expect(response.status).toBe(400)
  }
})

test('a viewer can report another public planet or published Moment but cannot report private or own content', async () => {
  addPublicMoment('report-public-moment')
  addPublicMoment('report-private-moment', 'private')

  const planetReport = await call('report-viewer', {
    target: { type: 'planet', id: 'report-target-planet' }, reason: 'privacy', detail: '请核查这项公开信息。',
  })
  expect(planetReport.status).toBe(201)
  expect(await planetReport.json()).toMatchObject({ report: { targetType: 'planet', reason: 'privacy', status: 'open' } })

  const momentReport = await call('report-viewer', {
    target: { type: 'moment', id: 'report-public-moment' }, reason: 'inappropriate',
  })
  expect(momentReport.status).toBe(201)
  expect(JSON.stringify(await momentReport.clone().json())).not.toContain('留给今天的一句话')

  for (const target of [
    { type: 'moment', id: 'report-private-moment' },
    { type: 'planet', id: 'report-viewer-planet' },
    { type: 'moment', id: 'does-not-exist' },
  ]) {
    const response = await call('report-viewer', { target, reason: 'spam' })
    expect(response.status).toBe(404)
  }
})

test('bottle, bottle-comment, and incoming message reports require a participation relationship', async () => {
  addReceivedBottle()
  const bottle = await call('report-viewer', { target: { type: 'drift_bottle', id: 'report-bottle' }, reason: 'spam' })
  expect(bottle.status).toBe(201)
  const comment = await call('report-viewer', { target: { type: 'drift_comment', id: 'report-comment' }, reason: 'harassment' })
  expect(comment.status).toBe(201)

  const now = new Date().toISOString()
  fixture.sqlite.prepare(`
    INSERT INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at)
    VALUES ('report-incoming-message', ?, ?, '未经邀请的文字内容', ?)
  `).run(targetId, viewerId, now)
  const dm = await call('report-viewer', { target: { type: 'direct_message', id: 'report-incoming-message' }, reason: 'harassment' })
  expect(dm.status).toBe(201)

  const outsiderId = await identityFor('report-outsider')
  createPlanet('report-outsider-planet', outsiderId, '旁观者')
  for (const target of [
    { type: 'drift_bottle', id: 'report-bottle' },
    { type: 'drift_comment', id: 'report-comment' },
    { type: 'direct_message', id: 'report-incoming-message' },
  ]) {
    const response = await call('report-outsider', { target, reason: 'spam' })
    expect(response.status).toBe(404)
  }
})

test('reports are unique per reporter and the atomic UTC daily limit is five', async () => {
  const duplicateTarget = { type: 'planet', id: 'report-target-planet' }
  expect((await call('report-viewer', { target: duplicateTarget, reason: 'spam' })).status).toBe(201)
  expect((await call('report-viewer', { target: duplicateTarget, reason: 'other' })).status).toBe(409)

  for (let index = 0; index < 5; index += 1) {
    const userId = await identityFor(`report-limit-${index}`)
    createPlanet(`report-limit-planet-${index}`, userId)
  }
  for (let index = 0; index < 4; index += 1) {
    const response = await call('report-viewer', {
      target: { type: 'planet', id: `report-limit-planet-${index}` }, reason: 'spam',
    })
    expect(response.status).toBe(201)
  }
  const overLimit = await call('report-viewer', {
    target: { type: 'planet', id: 'report-limit-planet-4' }, reason: 'spam',
  })
  expect(overLimit.status).toBe(429)
  expect(await overLimit.json()).toEqual({ error: 'REPORT_DAILY_LIMIT' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_content_reports WHERE reporter_user_id = ?').get(viewerId))
    .toEqual({ count: 5 })
})
