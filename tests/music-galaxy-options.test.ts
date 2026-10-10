import { afterEach, beforeEach, expect, test } from 'vitest'
import { onRequestGet } from '../functions/api/music/galaxy-options'
import { createMusicApiFixture, createMusicApiEnv, insertCatalogTrack } from './helpers/music-api-fixture'
let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => {
  fixture = createMusicApiFixture()
  for (let i = 0; i < 15; i++) insertCatalogTrack(fixture.sqlite, { id: `song-${i}`, title: `夜航 ${String(i).padStart(2,'0')}`, artistName: '夜航人' })
  insertCatalogTrack(fixture.sqlite, { id: 'inactive', title: '下架', artistName: '隐去', active: false })
  insertCatalogTrack(fixture.sqlite, { id: 'fake', title: '假歌', artistName: '假人' })
  fixture.sqlite.prepare("UPDATE music_track_catalog SET provider='moodverse-demo' WHERE id='fake'").run()
})
afterEach(() => fixture.close())
const request = (query: string) => onRequestGet({ request: new Request('https://mosic.test/api/music/galaxy-options?'+query), env: createMusicApiEnv(fixture.db) } as never)
test('search returns real songs in cursor pages and deduplicates matching artists', async () => {
  const first = await (await request('by=song&q=夜航')).json() as any
  expect(first.options).toHaveLength(12)
  expect(first.hasMore).toBe(true)
  expect(first.nextOffset).toBe(12)
  const last = await (await request('by=song&q=夜航&offset=12')).json() as any
  expect(last.options).toHaveLength(3)
  expect(last.hasMore).toBe(false)
  const artists = await (await request('by=artist&q=夜航人')).json() as any
  expect(artists.options).toEqual([{ id: 'artist-1', label: '夜航人' }])
  expect((await (await request('by=song&q=假歌')).json() as any).options).toEqual([])
  expect((await (await request('by=song&q=下架')).json() as any).options).toEqual([])
})
test('search rejects invalid classification or cursor instead of widening the query', async () => {
  for (const query of ['by=genre','by=song&offset=-1','by=artist&offset=1.5','by=song&q=%00'])
    expect((await request(query)).status).toBe(400)
})
