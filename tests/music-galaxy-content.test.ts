import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onRequestGet } from '../functions/api/music/galaxy-content'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => { fixture = createMusicApiFixture() })
afterEach(() => { fixture.close(); vi.unstubAllGlobals() })
const apiKey = 'must-not-leak'
const request = (query: string, live = false) => onRequestGet({
  request: new Request(`https://mosic.test/api/music/galaxy-content?${query}`),
  env: createMusicApiEnv(fixture.db, live ? { AUDIUS_API_KEY: apiKey } : {}),
} as never)
const page = async (query: string, live = false) => (await request(query, live)).json() as Promise<any>
function track(id: string, artist = 'artist-1', genre = 'Rock', active = true) {
  insertCatalogTrack(fixture.sqlite, { id, title: id, artistName: `Name ${artist}`, active })
  fixture.sqlite.prepare('UPDATE music_track_catalog SET artist_id=?, genres_json=? WHERE id=?')
    .run(artist, JSON.stringify([genre]), id)
}
const providerTrack = (i: number, extra = {}) => ({ id: `Song${i}`, title: `Song ${i}`, genre: 'Rock',
  user: { id: 'Artist1', name: 'The artist' }, is_streamable: true, ...extra })

test('song content is the exact active catalog track without consulting public planet selections', async () => {
  track('song-a'); track('song-hidden', 'artist-1', 'Rock', false)
  const result = await page('by=song&key=song-a')
  expect(result).toMatchObject({ by: 'song', key: 'song-a', label: 'song-a', description: null, status: 'local', hasMore: false, nextOffset: null })
  expect(result.tracks.map((t: any) => t.id)).toEqual(['song-a'])
  expect((await request('by=song&key=song-hidden')).status).toBe(404)
  expect((await page('by=song&key=song-a&offset=1')).tracks.map((t: any) => t.id)).toEqual(['song-a'])
})

test('song details include only other active songs from the exact same artist', async () => {
  track('song-main'); track('song-other'); track('wrong', 'artist-10'); track('inactive', 'artist-1', 'Rock', false)
  const result = await page('by=song&key=song-main')
  expect(result.relatedTracks.map((t: any) => t.id)).toEqual(['song-other'])
  expect(result.tracks.map((t: any) => t.id)).toEqual(['song-main'])
})

test('live song metadata uses real public provider fields and excludes the current song from recommendations', async () => {
  track('audius:Song0', 'audius:Artist1')
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname
    return Response.json({ data: path === '/v1/tracks/Song0' ? providerTrack(0, { description: 'Written by the artist', release_date: '2026-09-01', bpm: 124, musical_key: 'A minor', tags: 'night,live', play_count: 123 })
      : path.endsWith('/tracks') ? [providerTrack(0), providerTrack(1)] : { id: 'Artist1', name: 'The artist' } })
  })
  const result = await page('by=song&key=audius:Song0', true)
  expect(result.songDetails).toMatchObject({ description: 'Written by the artist', releasedAt: '2026-09-01', bpm: 124, musicalKey: 'A minor', tags: ['night', 'live'], playCount: 123 })
  expect(result.relatedTracks.map((t: any) => t.id)).toEqual(['audius:Song1'])
  expect(JSON.stringify(result)).not.toContain(apiKey)
})

test('local artist content uses exact artist ID and stable independent pages', async () => {
  for (let i = 0; i < 12; i++) track(`a${String(i).padStart(2, '0')}`)
  track('other', 'artist-10'); track('inactive', 'artist-1', 'Rock', false)
  const first = await page('by=artist&key=artist-1')
  const second = await page(`by=artist&key=artist-1&offset=${first.nextOffset}`)
  expect(first).toMatchObject({ label: 'Name artist-1', description: null, hasMore: true, nextOffset: 10, status: 'local' })
  expect(first.tracks).toHaveLength(10)
  expect(second.tracks.map((t: any) => t.id)).toEqual(['a10', 'a11'])
  expect(second).toMatchObject({ hasMore: false, nextOffset: null })
})

test('local genre content canonicalizes labels, matches genres exactly ignoring case, and paginates', async () => {
  for (let i = 0; i < 12; i++) track(`rock-${String(i).padStart(2, '0')}`, 'artist-1', i % 2 ? 'ROCK' : 'Rock')
  track('not-rock', 'artist-1', 'Rockabilly'); track('pop', 'artist-1', 'Pop')
  const first = await page('by=genre&key=rOcK')
  const second = await page('by=genre&key=rOcK&offset=10')
  expect(first).toMatchObject({ key: 'rOcK', label: 'Rock', description: null, hasMore: true, nextOffset: 10 })
  expect(first.tracks).toHaveLength(10)
  expect(second.tracks.map((t: any) => t.id)).toEqual(['rock-10', 'rock-11'])
})

test.each([
  '', 'by=planet&key=x', 'by=song', 'by=song&key=%20', 'by=artist&key=audius:../bad',
  'by=genre&key=Unknown', 'by=song&key=x&offset=-1', 'by=song&key=x&offset=1.5',
  'by=song&key=x&offset=10001', 'by=song&key=x&offset=NaN', 'by=song&key=x&offset=',
  'by=song&key=x&offset=1e2', 'by=song&key=%00bad',
])('invalid content query returns controlled JSON: %s', async query => {
  const response = await request(query, true)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'INVALID_GALAXY_CONTENT_QUERY' })
})

test('live artist content includes actual bio, all provider songs, cached rows and nonoverlapping pagination', async () => {
  const tracks = Array.from({ length: 12 }, (_, i) => providerTrack(i))
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('https://api.audius.co')
    expect(url.searchParams.get('api_key')).toBe(apiKey)
    if (url.pathname === '/v1/users/Artist1') return Response.json({ data: { id: 'Artist1', name: 'The artist', bio: 'Artist-written bio.' } })
    expect(url.pathname).toBe('/v1/users/Artist1/tracks')
    expect(url.searchParams.get('limit')).toBe('11')
    const offset = Number(url.searchParams.get('offset'))
    return Response.json({ data: tracks.slice(offset, offset + 11) })
  })
  vi.stubGlobal('fetch', fetcher)
  const first = await page('by=artist&key=audius:Artist1', true)
  const second = await page(`by=artist&key=audius:Artist1&offset=${first.nextOffset}`, true)
  expect(first).toMatchObject({ label: 'The artist', description: 'Artist-written bio.', status: 'live', nextOffset: 10, hasMore: true })
  expect(first.tracks.map((t: any) => t.id)).toEqual(tracks.slice(0, 10).map(t => `audius:${t.id}`))
  expect(second.tracks.map((t: any) => t.id)).toEqual(['audius:Song10', 'audius:Song11'])
  expect(second).toMatchObject({ hasMore: false, nextOffset: null })
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_track_catalog').get()).toEqual({ n: 12 })
  expect(JSON.stringify(first)).not.toContain(apiKey)
})

test('artist content filters gated and unrelated tracks while its cursor advances by consumed provider rows', async () => {
  const items = [providerTrack(0, { is_stream_gated: true }), providerTrack(1, { user: { id: 'Other', name: 'Other artist' } }),
    ...Array.from({ length: 10 }, (_, i) => providerTrack(i + 2))]
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    return Response.json({ data: url.pathname.endsWith('/tracks') ? items.slice(Number(url.searchParams.get('offset')), Number(url.searchParams.get('offset')) + 11)
      : { id: 'Artist1', name: 'The artist' } })
  })
  const first = await page('by=artist&key=audius:Artist1', true)
  const second = await page(`by=artist&key=audius:Artist1&offset=${first.nextOffset}`, true)
  expect(first.tracks).toHaveLength(9)
  expect(first.nextOffset).toBe(11)
  expect(second.tracks.map((t: any) => t.id)).toEqual(['audius:Song11'])
  expect(fixture.sqlite.prepare("SELECT count(*) AS n FROM music_track_catalog WHERE id IN ('audius:Song0','audius:Song1')").get()).toEqual({ n: 0 })
})

test('live genres pass canonical genre and provider offset, and cached pages keep that filter', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input)), offset = Number(url.searchParams.get('offset'))
    expect(url.pathname).toBe('/v1/tracks/trending')
    expect(url.searchParams.get('genre')).toBe('Rock')
    return Response.json({ data: Array.from({ length: offset === 0 ? 24 : 2 }, (_, i) => providerTrack(offset + i)) })
  })
  vi.stubGlobal('fetch', fetcher)
  const first = await page('by=genre&key=rock', true)
  const cached = await page('by=genre&key=ROCK', true)
  const second = await page(`by=genre&key=rock&offset=${first.nextOffset}`, true)
  expect(first).toMatchObject({ label: 'Rock', status: 'live', nextOffset: 24, hasMore: true })
  expect(first.tracks).toHaveLength(24)
  expect(cached.status).toBe('cached')
  expect(second.tracks.map((t: any) => t.id)).toEqual(['audius:Song24', 'audius:Song25'])
  expect(second.nextOffset).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('an artist page with no eligible tracks retains a usable provider cursor', async () => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => Response.json({ data: String(input).includes('/tracks?')
    ? Array.from({ length: 11 }, (_, i) => providerTrack(i, { access: { stream: false } }))
    : { id: 'Artist1', name: 'The artist' } }))
  const result = await page('by=artist&key=audius:Artist1', true)
  expect(result).toMatchObject({ tracks: [], hasMore: true, nextOffset: 11, status: 'live' })
})

test('provider failure returns only matching local artist/genre songs without a fabricated biography or secrets', async () => {
  track('matching', 'audius:Artist1', 'ROCK'); track('wrong', 'audius:Other', 'Pop')
  vi.stubGlobal('fetch', async () => { throw new Error(`offline: ${apiKey}`) })
  for (const query of ['by=artist&key=audius:Artist1', 'by=genre&key=rock']) {
    const result = await page(query, true)
    expect(result).toMatchObject({ status: 'offline', description: null, hasMore: false, nextOffset: null })
    expect(result.tracks.map((t: any) => t.id)).toEqual(['matching'])
    expect(JSON.stringify(result)).not.toContain(apiKey)
  }
})
