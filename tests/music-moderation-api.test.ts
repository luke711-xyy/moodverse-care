import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { authenticatedMusicUser, type Env } from '../functions/_shared'
import { onRequestGet as listReports } from '../functions/api/admin/music-reports'
import { onRequestPatch as reviewReport } from '../functions/api/admin/music-reports/[id]'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-moderation-test.cloudflareaccess.com'
const audience = 'music-moderation-test-audience'
const moderatorEmail = 'moderator@example.com'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let moderatorId: string
let reporterId: string
let targetId: string

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  moderatorId = await identityFor('moderator', moderatorEmail)
  reporterId = await identityFor('reporter', 'reporter@example.com')
  targetId = await identityFor('target', 'target@example.com')
  insertCatalogTrack(fixture.sqlite, { id: 'moderation-track' })
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES ('planet-target', ?, 'Target', '', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(targetId)
})
afterEach(() => fixture.close())

function env(moderators?: string) {
  return createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    ...(moderators === undefined ? {} : { MUSIC_MODERATOR_EMAILS: moderators }),
  })
}

async function identityFor(subject: string, email: string) {
  const request = await authority.request({ sub: subject, email })
  return (await authenticatedMusicUser(request, env()))!.userId
}

function addReport(id: string, status: 'open' | 'reviewing' | 'actioned' | 'dismissed' = 'open') {
  fixture.sqlite.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, created_at, updated_at)
    VALUES (?, ?, 'moderation-track', 'target-private-content', 'private', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(`target-${id}`, 'planet-target')
  fixture.sqlite.prepare(`
    INSERT INTO music_content_reports
      (id, reporter_user_id, target_type, target_id, reason, detail, status, created_at)
    VALUES (?, ?, 'moment', ?, 'privacy', '报告中提供的上下文。', ?, '2026-09-30T08:00:00.000Z')
  `).run(id, reporterId, `target-${id}`, status)
}

async function requestFor(
  subject: string,
  email: string,
  method: 'GET' | 'PATCH',
  options: { query?: string; body?: unknown; origin?: string; authenticated?: boolean; id?: string } = {},
) {
  const signed = options.authenticated === false
    ? new Headers()
    : new Headers((await authority.request({ sub: subject, email })).headers)
  if (method === 'PATCH' && options.origin !== '') signed.set('Origin', options.origin ?? 'https://moodverse.test')
  const path = `/api/admin/music-reports${options.id ? `/${options.id}` : ''}${options.query ?? ''}`
  const request = new Request(`https://moodverse.test${path}`, {
    method,
    headers: options.body === undefined ? signed : { ...Object.fromEntries(signed), 'content-type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const context = { request, env: env(' MODERATOR@example.com , another@example.com '), params: { id: options.id } } as unknown as PagesFunctionEvent<Env>
  return method === 'GET' ? listReports(context) : reviewReport(context)
}

test('the report queue stays undiscoverable without an allowlist and for non-moderators', async () => {
  const noAllowlist = await listReports({
    request: new Request('https://moodverse.test/api/admin/music-reports'),
    env: env(),
  } as never)
  expect(noAllowlist.status).toBe(404)

  const nonModerator = await requestFor('reporter', 'reporter@example.com', 'GET')
  expect(nonModerator.status).toBe(404)

  const anonymous = await requestFor('ignored', 'ignored@example.com', 'GET', { authenticated: false })
  expect(anonymous.status).toBe(401)
})

test('an allowlisted moderator sees bounded report metadata, not target-private content or account emails', async () => {
  addReport('report-old')
  addReport('report-reviewed', 'reviewing')
  const response = await requestFor('moderator', moderatorEmail, 'GET')
  expect(response.status).toBe(200)
  const body = await response.json() as { reports: Array<Record<string, unknown>> }
  expect(body.reports).toHaveLength(1)
  expect(body.reports[0]).toMatchObject({
    id: 'report-old',
    target: { type: 'moment', id: 'target-report-old' },
    reason: 'privacy',
    detail: '报告中提供的上下文。',
    status: 'open',
    createdAt: '2026-09-30T08:00:00.000Z',
  })
  expect(JSON.stringify(body)).not.toContain(moderatorEmail)
  expect(JSON.stringify(body)).not.toContain('reporter@example.com')
  expect(JSON.stringify(body)).not.toContain(reporterId)
  expect(JSON.stringify(body)).not.toContain('target-private-content')

  const filtered = await requestFor('moderator', moderatorEmail, 'GET', { query: '?status=reviewing&limit=5' })
  expect(await filtered.json()).toMatchObject({ reports: [{ id: 'report-reviewed', status: 'reviewing' }] })
  expect((await requestFor('moderator', moderatorEmail, 'GET', { query: '?status=unknown' })).status).toBe(400)
})

test('the report queue supports bounded offset pagination without skipping older rows', async () => {
  addReport('report-page-a')
  addReport('report-page-b')
  addReport('report-page-c')

  const page = await requestFor('moderator', moderatorEmail, 'GET', { query: '?status=open&limit=1&offset=1' })
  expect(page.status).toBe(200)
  expect(await page.json()).toMatchObject({ reports: [{ id: 'report-page-b' }], hasMore: true })
  expect((await requestFor('moderator', moderatorEmail, 'GET', { query: '?offset=1.5' })).status).toBe(400)
})

test('report review requires same-origin exact status transitions and records reviewer identity', async () => {
  addReport('report-review')

  const crossOrigin = await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'report-review', body: { status: 'reviewing' }, origin: 'https://attacker.example',
  })
  expect(crossOrigin.status).toBe(403)
  expect(fixture.sqlite.prepare('SELECT status FROM music_content_reports WHERE id = ?').get('report-review'))
    .toEqual({ status: 'open' })

  expect((await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'report-review', body: { status: 'open', note: 'extra fields are not accepted' },
  })).status).toBe(400)

  const reviewing = await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'report-review', body: { status: 'reviewing' },
  })
  expect(reviewing.status).toBe(200)
  expect(await reviewing.json()).toMatchObject({ report: { id: 'report-review', status: 'reviewing', lastReview: { reviewerUserId: moderatorId, fromStatus: 'open', toStatus: 'reviewing' } } })
  expect(fixture.sqlite.prepare('SELECT from_status, to_status, reviewer_user_id, created_at FROM music_report_reviews WHERE report_id = ?').get('report-review'))
    .toMatchObject({ from_status: 'open', to_status: 'reviewing', reviewer_user_id: moderatorId, created_at: expect.any(String) })

  expect((await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'report-review', body: { status: 'dismissed' },
  })).status).toBe(200)
  expect((await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'report-review', body: { status: 'reviewing' },
  })).status).toBe(409)
  expect((await requestFor('moderator', moderatorEmail, 'PATCH', {
    id: 'missing-report', body: { status: 'dismissed' },
  })).status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_report_reviews WHERE report_id = ?').get('report-review'))
    .toEqual({ count: 2 })
  fixture.sqlite.prepare('DELETE FROM users WHERE id = ?').run(moderatorId)
  expect(fixture.sqlite.prepare('SELECT reviewer_user_id FROM music_report_reviews WHERE report_id = ? ORDER BY created_at LIMIT 1').get('report-review'))
    .toEqual({ reviewer_user_id: null })
})
