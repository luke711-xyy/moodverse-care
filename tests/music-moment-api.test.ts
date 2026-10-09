import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestGet as onRequestGetMoments, onRequestPost as onRequestPostMoment } from '../functions/api/me/music-planet/moments'
import {
  onRequestDelete as onRequestDeleteMoment,
  onRequestPatch as onRequestPatchMoment,
} from '../functions/api/me/music-planet/moments/[id]'
import { onRequestGet as onRequestGetPublicPlanet } from '../functions/api/music/planets/[id]'
import { onRequestGet as onRequestGetPhoto } from '../functions/api/music/moment-photos/[id]'
import { MOMENT_PHOTO_MAX_BYTES } from '../src/music/moment-photo'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import {
  createMusicApiEnv,
  createMusicApiFixture,
  insertCatalogTrack,
} from './helpers/music-api-fixture'

const issuer = 'https://music-moments-test.cloudflareaccess.com'
const audience = 'music-moments-test-audience'
const ownerSubject = 'moment-owner-subject'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let ownerId: string
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII='), c => c.charCodeAt(0))
let photoObjects: Map<string, { bytes: Uint8Array; httpMetadata: { contentType: string } }>
let media: R2Bucket

beforeAll(async () => {
  authority = await createAccessTestAuthority(issuer, audience)
})

beforeEach(async () => {
  fixture = createMusicApiFixture()
  photoObjects = new Map()
  media = {
    put: vi.fn(async (key, bytes, options) => { photoObjects.set(key, { bytes: new Uint8Array(bytes), httpMetadata: options.httpMetadata }) }),
    get: vi.fn(async key => { const object = photoObjects.get(key); return object ? { ...object, size: object.bytes.length, body: new Blob([object.bytes]).stream() } : null }),
    delete: vi.fn(async key => { photoObjects.delete(key) }),
  } as unknown as R2Bucket
  authority.installJwks()
  insertCatalogTrack(fixture.sqlite, { id: 'track-a', title: 'A Song' })
  insertCatalogTrack(fixture.sqlite, { id: 'track-b', title: 'B Song' })
  insertCatalogTrack(fixture.sqlite, { id: 'track-c', title: 'C Song' })
  insertCatalogTrack(fixture.sqlite, { id: 'track-inactive', active: false })

  const identity = await authenticatedMusicUser(
    await authority.request({ sub: ownerSubject, email: 'owner@example.com' }),
    env(),
  )
  ownerId = identity!.userId
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, created_at, updated_at)
    VALUES ('planet-owner', ?, '夜航者', '跟着歌声靠岸', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
  `).run(ownerId)
  for (const [position, trackId] of ['track-a', 'track-b', 'track-c'].entries()) {
    fixture.sqlite.prepare(`
      INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
      VALUES ('planet-owner', ?, ?, ?, '2026-09-01T00:00:00.000Z')
    `).run(trackId, position, position === 0 ? 1 : 0)
  }
})

afterEach(() => {
  fixture.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function env(overrides: Partial<Env> = {}) {
  return createMusicApiEnv(fixture.db, {
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    MUSIC_MEDIA: media,
    ...overrides,
  })
}

type TestHandler = (context: { request: Request; env: Env; params?: Record<string, string> }) => Promise<Response>

async function callOwner(
  handler: TestHandler,
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  subject = ownerSubject,
  overrides: Partial<Env> = {},
  pending: Promise<unknown>[] = [],
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const request = new Request('https://moodverse.test/api/me/music-planet/moments', {
    method,
    headers: body === undefined || body instanceof FormData
      ? signed.headers
      : {
          'Cf-Access-Jwt-Assertion': signed.headers.get('Cf-Access-Jwt-Assertion')!,
          'content-type': 'application/json',
        },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  return handler({ request, env: env(overrides), params, waitUntil: (task: Promise<unknown>) => pending.push(task) })
}

async function createMoment(body: unknown, subject = ownerSubject) {
  const response = await callOwner(onRequestPostMoment, 'POST', body, {}, subject)
  return { response, body: await response.json() as { moment?: Record<string, any>; error?: string } }
}

async function getOwnerMoments(subject = ownerSubject) {
  const response = await callOwner(onRequestGetMoments, 'GET', undefined, {}, subject)
  return { response, body: await response.json() as { moments: Array<Record<string, any>> } }
}

async function getPublicPlanet() {
  const request = new Request('https://moodverse.test/api/music/planets/planet-owner')
  const response = await onRequestGetPublicPlanet({ request, env: env(), params: { id: 'planet-owner' } } as never)
  return { response, body: await response.json() as { planet?: Record<string, any>; error?: string } }
}

function photoDraft(files: File[] = [new File([png], 'one.png', { type: 'image/png' })]) {
  const form = new FormData()
  form.set('trackId', 'track-a'); form.set('contentText', '照片中的片刻'); form.set('visibility','public')
  files.forEach(file => form.append('photo', file))
  return form
}

test('single photo uploads persist and appear in owner and public Moments; deleting removes storage', async () => {
  const created = await callOwner(onRequestPostMoment, 'POST', photoDraft())
  expect(created.status).toBe(201)
  const { moment } = await created.json() as { moment: { id: string; photoUrl: string } }
  expect(moment.photoUrl).toBe(`/api/music/moment-photos/${moment.id}`)
  expect((await getOwnerMoments()).body.moments[0].photoUrl).toBe(moment.photoUrl)
  expect((await getPublicPlanet()).body.planet!.moments[0].photoUrl).toBe(moment.photoUrl)
  const photo = await callOwner(onRequestGetPhoto, 'GET', undefined, { id: moment.id }, 'photo-visitor')
  expect(photo.status).toBe(200)
  expect(photo.headers.get('content-type')).toBe('image/png')
  expect(photo.headers.get('cache-control')).toContain('no-store')
  expect(new Uint8Array(await photo.arrayBuffer())).toEqual(png)
  const deleted = await callOwner(onRequestDeleteMoment, 'DELETE', undefined, { id: moment.id })
  expect(deleted.status).toBe(200)
  expect(photoObjects.size).toBe(0)
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,{ id: moment.id })).status).toBe(404)
})

test('photo links enforce Moment visibility, planet visibility and blocking on every read', async () => {
  const created = await callOwner(onRequestPostMoment,'POST',photoDraft())
  const { moment } = await created.json() as { moment: { id: string } }
  const params = { id: moment.id }
  await callOwner(onRequestPatchMoment,'PATCH',{visibility:'private'},params)
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,params,'photo-visitor')).status).toBe(404)
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,params)).status).toBe(200)
  await callOwner(onRequestPatchMoment,'PATCH',{visibility:'public'},params)
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private' WHERE id='planet-owner'").run()
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,params,'photo-visitor')).status).toBe(404)
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,params)).status).toBe(200)
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='public' WHERE id='planet-owner'").run()
  const visitor = await authenticatedMusicUser(await authority.request({sub:'photo-visitor',email:'photo-visitor@example.com'}),env())
  fixture.sqlite.prepare('INSERT INTO music_user_blocks (blocker_user_id,blocked_user_id,created_at) VALUES (?,?,?)').run(ownerId,visitor!.userId,new Date().toISOString())
  expect((await callOwner(onRequestGetPhoto,'GET',undefined,params,'photo-visitor')).status).toBe(404)
})

test('photo upload rejects multiple, oversized, renamed and unsupported files before writing', async () => {
  for (const [form, code, status] of [
    [photoDraft([new File([png],'a.png',{type:'image/png'}),new File([png],'b.png',{type:'image/png'})]),'TOO_MANY_PHOTOS',400],
    [photoDraft([new File([new Uint8Array(MOMENT_PHOTO_MAX_BYTES + 1)],'big.png',{type:'image/png'})]),'PHOTO_TOO_LARGE',413],
    [photoDraft([new File(['<svg/>'],'a.svg',{type:'image/svg+xml'})]),'UNSUPPORTED_PHOTO_TYPE',400],
    [photoDraft([new File(['not a photo'],'renamed.jpg',{type:'image/jpeg'})]),'INVALID_PHOTO',400],
  ] as const) {
    const response = await callOwner(onRequestPostMoment,'POST',form)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
  }
  expect(media.put).not.toHaveBeenCalled()
  expect((await getOwnerMoments()).body.moments).toHaveLength(0)
})

test('photo save failures do not publish a text-only Moment or leave an orphan object', async () => {
  const noStorage = await callOwner(onRequestPostMoment,'POST',photoDraft(),{},ownerSubject,{MUSIC_MEDIA:undefined})
  expect(noStorage.status).toBe(503)
  expect((await getOwnerMoments()).body.moments).toHaveLength(0)
  const prepare = fixture.db.prepare.bind(fixture.db)
  vi.spyOn(fixture.db,'prepare').mockImplementation(sql => {
    const statement = prepare(sql)
    if (sql.includes('INSERT INTO music_moments')) statement.run = async () => { throw new Error('simulated write failure') }
    return statement
  })
  const failed = await callOwner(onRequestPostMoment,'POST',photoDraft())
  expect(failed.status).toBe(503)
  expect(photoObjects.size).toBe(0)
})

test('Moments default to public, private Moments remain owner-readable, and their publication timestamps reflect visibility', async () => {
  const publicCreated = await createMoment({ trackId: 'track-a', contentText: '今天想把这首歌留在这里。' })
  const privateCreated = await createMoment({
    trackId: 'track-b', contentText: '只留给自己看的话。', visibility: 'private',
  })
  expect(publicCreated.response.status).toBe(201)
  expect(publicCreated.body.moment).toMatchObject({ visibility: 'public', trackId: 'track-a' })
  expect(publicCreated.body.moment?.publishedAt).toBeTruthy()
  expect(privateCreated.response.status).toBe(201)
  expect(privateCreated.body.moment).toMatchObject({ visibility: 'private', publishedAt: null })

  const owner = await getOwnerMoments()
  expect(owner.response.status).toBe(200)
  expect(owner.body.moments.map((moment) => moment.contentText)).toEqual(expect.arrayContaining([
    '今天想把这首歌留在这里。', '只留给自己看的话。',
  ]))
})

test('creating a public Moment preserves appearance and never queues a composition task', async () => {
  const before = fixture.sqlite.prepare('SELECT visual_json FROM music_planets WHERE id=?').get('planet-owner')
  const previousFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString())
    if (url.origin === issuer) return previousFetch(input, init)
    return new Response(JSON.stringify({
      model: { name: 'qwen-local', version: '4b-q4-v1' },
      output: {
        schemaVersion: 2,
        summary: '在夜色中慢慢流动。',
        palette: { surface: '#315f98', ocean: '#102d5c', accent: '#8ec9ed' },
        atmosphere: 'starlit',
        motion: 'drift',
        particleDensity: 0.42,
        terrainFeatures: { mountainRanges: 4, basins: 2, canyons: 1, escarpments: 1 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  const pending: Promise<unknown>[] = []
  const created = await callOwner(onRequestPostMoment, 'POST', {
    trackId: 'track-a', contentText: '新的公开一刻。',
  }, {}, ownerSubject, {
    MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose',
    MUSIC_AI_ACCESS_CLIENT_ID: 'access-client-id',
    MUSIC_AI_ACCESS_CLIENT_SECRET: 'access-client-secret',
    MUSIC_AI_GATEWAY_TOKEN: 'test-gateway-secret',
  }, pending)

  expect(created.status).toBe(201)
  expect(pending).toHaveLength(0)
  expect(fixture.sqlite.prepare(`SELECT count(*) AS count FROM music_ai_tasks WHERE kind='planet_composer'`).get()).toEqual({ count: 0 })
  expect(fixture.sqlite.prepare('SELECT visual_json FROM music_planets WHERE id=?').get('planet-owner')).toEqual(before)
})

test('all owner Moment operations reject requests without a verified Access identity', async () => {
  const request = new Request('https://moodverse.test/api/me/music-planet/moments', { method: 'POST' })
  const context = { request, env: env(), params: { id: 'moment-id' } } as never

  expect((await onRequestGetMoments(context)).status).toBe(401)
  expect((await onRequestPostMoment(context)).status).toBe(401)
  expect((await onRequestPatchMoment(context)).status).toBe(401)
  expect((await onRequestDeleteMoment(context)).status).toBe(401)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_moments').get()).toEqual({ count: 0 })
})

test('anonymous public projection includes only public Moments and safe public planet fields', async () => {
  await createMoment({ trackId: 'track-a', contentText: '访客可以看到。', photoUrl: 'https://images.example/public.jpg' })
  await createMoment({ trackId: 'track-b', contentText: '绝不能泄露。', visibility: 'private' })

  const { response, body } = await getPublicPlanet()
  expect(response.status).toBe(200)
  expect(body.planet).toMatchObject({ id: 'planet-owner', displayName: '夜航者', visibility: 'public' })
  expect(body.planet?.tracks.map((track: { id: string }) => track.id)).toEqual(['track-a', 'track-b', 'track-c'])
  expect(body.planet?.moments.map((moment: { contentText: string }) => moment.contentText)).toEqual(['访客可以看到。'])
  expect(JSON.stringify(body)).not.toContain('绝不能泄露')
  expect(body.planet).not.toHaveProperty('ownerUserId')
  expect(body.planet).not.toHaveProperty('email')
})

test('private planets are indistinguishable from missing planets to public visitors', async () => {
  fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE id = 'planet-owner'").run()
  const { response, body } = await getPublicPlanet()
  expect(response.status).toBe(404)
  expect(body).toEqual({ error: 'PLANET_NOT_FOUND' })

  const owner = await getOwnerMoments()
  expect(owner.response.status).toBe(200)
})

test('public projection omits music and image URLs containing embedded credentials', async () => {
  await createMoment({ trackId: 'track-a', contentText: '公开内容。' })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET official_url = 'https://provider-user:provider-secret@music.example/track',
        cover_url = 'https://image-user:image-secret@images.example/cover.jpg'
    WHERE id = 'track-a'
  `).run()

  const { body } = await getPublicPlanet()
  expect(body.planet?.tracks[0]).toMatchObject({ officialUrl: null, coverUrl: null })
  expect(body.planet?.moments[0].track).toMatchObject({ officialUrl: null, coverUrl: null })
})

test('Moments require active catalog tracks and reject unsafe photos or oversized text', async () => {
  for (const invalid of [
    { trackId: 'missing-track', contentText: '未知曲目' },
    { trackId: 'track-inactive', contentText: '下架曲目' },
    { trackId: 'track-a', contentText: '不安全图片', photoUrl: 'javascript:alert(1)' },
    { trackId: 'track-a', contentText: '长内容'.repeat(501) },
  ]) {
    const { response } = await createMoment(invalid)
    expect(response.status).toBe(400)
  }
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_moments').get()).toEqual({ count: 0 })
})

test('only the owner can change Moment privacy or delete; unpublishing is immediate and republishing refreshes its timestamp', async () => {
  const created = await createMoment({ trackId: 'track-a', contentText: '暂时公开的内容。' })
  const momentId = created.body.moment?.id as string
  fixture.sqlite.prepare("UPDATE music_moments SET published_at = '2026-09-01T00:00:00.000Z' WHERE id = ?").run(momentId)

  const strangerPatch = await callOwner(onRequestPatchMoment, 'PATCH', {
    visibility: 'private',
  }, { id: momentId }, 'stranger-subject')
  expect(strangerPatch.status).toBe(404)
  const strangerDelete = await callOwner(onRequestDeleteMoment, 'DELETE', undefined, { id: momentId }, 'stranger-subject')
  expect(strangerDelete.status).toBe(404)

  const madePrivate = await callOwner(onRequestPatchMoment, 'PATCH', {
    visibility: 'private',
  }, { id: momentId })
  const privateBody = await madePrivate.json() as { moment: Record<string, any> }
  expect(madePrivate.status).toBe(200)
  expect(privateBody.moment).toMatchObject({ visibility: 'private', publishedAt: null })
  expect((await getPublicPlanet()).body.planet?.moments).toEqual([])

  const republished = await callOwner(onRequestPatchMoment, 'PATCH', {
    visibility: 'public',
  }, { id: momentId })
  const republishedBody = await republished.json() as { moment: Record<string, any> }
  expect(republishedBody.moment.publishedAt).not.toBe('2026-09-01T00:00:00.000Z')
  expect((await getPublicPlanet()).body.planet?.moments).toHaveLength(1)

  const ownerDelete = await callOwner(onRequestDeleteMoment, 'DELETE', undefined, { id: momentId })
  expect(ownerDelete.status).toBe(200)
  expect((await getOwnerMoments()).body.moments).toEqual([])
})
