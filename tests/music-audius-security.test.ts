import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onRequestGet as stream } from '../functions/api/music/tracks/[id]/stream'
import { onRequestGet as catalog } from '../functions/api/music/catalog'
import { audiusCatalogRow } from '../functions/_music-audius'
import { onRequestGet as genres, onRequestPatch as saveGenres } from '../functions/api/me/galaxy-preferences'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => {
  fixture = createMusicApiFixture()
  insertCatalogTrack(fixture.sqlite, { id: 'audius:Ab123', title: 'A Song' })
  fixture.sqlite.prepare("UPDATE music_track_catalog SET provider='audius',provider_track_id='Ab123' WHERE id='audius:Ab123'").run()
})
afterEach(() => { fixture.close(); vi.unstubAllGlobals() })
const env = () => createMusicApiEnv(fixture.db, { AUDIUS_API_KEY: 'never-leak-this', MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false' })
test('stream redirects only a known public full track, supports encoded IDs and strips the server credential', async () => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    expect(url.searchParams.get('api_key')).toBe('never-leak-this')
    return Response.json({ data: url.pathname.endsWith('/stream') ? 'https://creatornode.audius.co/song.mp3?signature=temporary' : { is_streamable: true, is_available: true } })
  })
  const result = await stream({ params: { id: 'audius%3AAb123' }, env: env() } as never)
  expect(result.status).toBe(302)
  expect(result.headers.get('location')).toBe('https://creatornode.audius.co/song.mp3?signature=temporary')
  expect([...result.headers].join()).not.toContain('never-leak-this')
  const unknown = await stream({ params: { id: 'audius:Missing' }, env: env() } as never)
  expect(unknown.status).toBe(404)
})
test('stream refuses gated content and credential-bearing redirect URLs', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ data: { is_stream_gated: true } }))
  expect((await stream({ params: { id: 'audius:Ab123' }, env: env() } as never)).status).toBe(410)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => Response.json({ data: String(input).includes('/stream?') ? 'https://public.example/audio?api_key=never-leak-this' : { is_streamable: true } }))
  const result = await stream({ params: { id: 'audius:Ab123' }, env: env() } as never)
  expect(result.status).toBe(502)
  expect(await result.text()).not.toContain('never-leak-this')
})
test('missing or invalid provider tempo stays missing and paid/unlisted songs are not selectable', () => {
  const base = { id: 'Ab123', title: 'Song', user: { id: 'Artist1', name: 'Artist' }, genre: 'Ambient' }
  expect(JSON.parse(audiusCatalogRow({ ...base, bpm: 999 })!.visual_features_json!)).toEqual({ source: 'audius', tempoBpm: null })
  expect(audiusCatalogRow({ ...base, is_unlisted: true })).toBeNull()
  expect(audiusCatalogRow({ ...base, is_stream_gated: true })).toBeNull()
})
test('provider outage serves the exact cached search page rather than unrelated trending songs', async () => {
  fixture.sqlite.prepare('INSERT INTO music_catalog_queries VALUES (?,?,?,?)').run('["night","Rock",0]', '["audius:Ab123"]', 0, 0)
  vi.stubGlobal('fetch', async () => { throw new Error('offline with never-leak-this') })
  const result = await catalog({ request: new Request('https://mosic.test/api/music/catalog?q=Night&genre=Rock'), env: env() } as never)
  const body = await result.json() as any
  expect(body.status).toBe('offline')
  expect(body.tracks.map((t: any) => t.id)).toEqual(['audius:Ab123'])
  expect(JSON.stringify(body)).not.toContain('never-leak-this')
})
test('Galaxy genre preferences default to eight, persist per device and reject invalid/empty choices', async () => {
  const response = await genres({ request: new Request('https://mosic.test/api/me/galaxy-preferences'), env: env() } as never)
  const cookie = response.headers.get('set-cookie')!.split(';')[0]
  expect((await response.json() as any).genres).toHaveLength(8)
  const request = (value: unknown) => new Request('https://mosic.test/api/me/galaxy-preferences', { method: 'PATCH', headers: { Origin: 'https://mosic.test', Cookie: cookie }, body: JSON.stringify({ genres: value }) })
  expect((await saveGenres({ request: request([]), env: env() } as never)).status).toBe(400)
  expect((await saveGenres({ request: request(['Not a genre']), env: env() } as never)).status).toBe(400)
  const saved = await saveGenres({ request: request(['Metal', 'Lo-Fi']), env: env() } as never)
  expect((await saved.json() as any).genres).toEqual(['Metal', 'Lo-Fi'])
  const reread = await genres({ request: new Request('https://mosic.test/api/me/galaxy-preferences', { headers: { Cookie: cookie } }), env: env() } as never)
  expect((await reread.json() as any).genres).toEqual(['Metal', 'Lo-Fi'])
})
