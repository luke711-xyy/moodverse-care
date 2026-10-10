import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onRequestGet as getPreferences, onRequestPatch as patchPreferences } from '../functions/api/me/galaxy-preferences'
import { onRequestGet as getGalaxy } from '../functions/api/music/galaxy'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => {
  fixture = createMusicApiFixture()
  for (let i = 0; i < 12; i++) {
    insertCatalogTrack(fixture.sqlite, { id: `song-${i}`, title: `Track ${i}`, artistName: `Artist ${i}` })
    fixture.sqlite.prepare('UPDATE music_track_catalog SET artist_id=? WHERE id=?').run(`artist-${i}`, `song-${i}`)
  }
})
afterEach(() => { fixture.close(); vi.useRealTimers(); vi.restoreAllMocks() })
const env = () => createMusicApiEnv(fixture.db, { MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false' })
async function account() {
  const response = await getPreferences({ request: new Request('https://mosic.test/api/me/galaxy-preferences'), env: env() } as never)
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], body: await response.json() as any }
}
const patch = (cookie: string, body: unknown, origin = 'https://mosic.test') => patchPreferences({
  request: new Request('https://mosic.test/api/me/galaxy-preferences', { method: 'PATCH', headers: { Cookie: cookie, Origin: origin }, body: JSON.stringify(body) }), env: env(),
} as never)
const read = (cookie: string) => getPreferences({ request: new Request('https://mosic.test/api/me/galaxy-preferences', { headers: { Cookie: cookie } }), env: env() } as never)
const galaxy = (cookie: string, by: string) => getGalaxy({ request: new Request(`https://mosic.test/api/music/galaxy?by=${by}`, { headers: { Cookie: cookie } }), env: env() } as never)

test('artist and song pools persist independently, preserve genres, and never cross accounts', async () => {
  const a = await account(), b = await account()
  expect(a.body.artists).toEqual([])
  expect(a.body.songs).toEqual([])
  expect((await patch(a.cookie, { artists: ['artist-2'], songs: ['song-3'] })).status).toBe(200)
  expect((await patch(a.cookie, { genres: ['Jazz'] })).status).toBe(200)
  const saved = await (await read(a.cookie)).json() as any
  expect(saved).toMatchObject({ genres: ['Jazz'], artists: [{ id: 'artist-2', label: 'Artist 2' }], songs: [{ id: 'song-3', label: 'Track 3 · Artist 3' }] })
  expect((await (await read(b.cookie)).json() as any).artists).toEqual([])
  await patch(a.cookie, { artists: [] })
  expect(await (await read(a.cookie)).json()).toMatchObject({ artists: [], songs: [{ id: 'song-3' }], genres: ['Jazz'] })
})
test('invalid IDs, duplicate or oversized pools, extra fields and cross-origin writes are rejected without partial changes', async () => {
  const a = await account()
  for (const body of [{ songs: ['missing'] }, { artists: ['artist-1', 'artist-1'] }, { songs: Array.from({ length: 65 }, (_, i) => `song-${i}`) }, { artists: ['artist-1'], userId: 'another' }, { genres: ['Jazz'], songs: ['missing'] }]) {
    expect((await patch(a.cookie, body)).status).toBe(400)
  }
  expect((await patch(a.cookie, { songs: ['song-1'] }, 'https://evil.test')).status).toBe(401)
  expect(await (await read(a.cookie)).json()).toMatchObject({ genres: a.body.genres, artists: [], songs: [] })
})
test('selected songs and artists without public planets remain navigable without leaking private planets', async () => {
  const a = await account()
  await patch(a.cookie, { artists: ['artist-2'], songs: ['song-3'] })
  expect(await (await galaxy(a.cookie, 'artist')).json()).toMatchObject({ groups: [{ key: 'artist-2', label: 'Artist 2', planetCount: 0, planets: [] }] })
  expect(await (await galaxy(a.cookie, 'song')).json()).toMatchObject({ groups: [{ key: 'song-3', planetCount: 0, planets: [] }] })
})
test('each classification samples no more than eight distinct nodes from the full selected pool', async () => {
  const a = await account()
  await patch(a.cookie, { artists: Array.from({ length: 12 }, (_, i) => `artist-${i}`), songs: Array.from({ length: 12 }, (_, i) => `song-${i}`), genres: ['Pop','Rock','Jazz','Classical','Ambient','Electronic','Metal','Folk','Blues','Country'] })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
  for (const by of ['artist', 'song', 'genre']) {
    const result = await (await galaxy(a.cookie, by)).json() as any
    expect(result.groups).toHaveLength(8)
    expect(new Set(result.groups.map((g: any) => g.key)).size).toBe(8)
    expect((await (await galaxy(a.cookie, by)).json() as any).groups).toEqual(result.groups)
    vi.setSystemTime(new Date('2026-10-10T16:00:00Z'))
    expect((await (await galaxy(a.cookie, by)).json() as any).groups).not.toEqual(result.groups)
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
  }
})
