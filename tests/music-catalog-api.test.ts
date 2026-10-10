import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onRequestGet } from '../functions/api/music/catalog'
import {
  createMusicApiEnv,
  createMusicApiFixture,
  insertCatalogTrack,
} from './helpers/music-api-fixture'

let fixture: ReturnType<typeof createMusicApiFixture>

beforeEach(() => {
  fixture = createMusicApiFixture()
})

afterEach(() => { fixture.close(); vi.unstubAllGlobals() })

async function getCatalog(query = '') {
  const request = new Request(`https://moodverse.test/api/music/catalog${query ? `?q=${encodeURIComponent(query)}` : ''}`)
  return onRequestGet({ request, env: createMusicApiEnv(fixture.db) } as never)
}

test('local catalog provides a next cursor and reaches entries beyond the first fifty', async () => {
  for (let i = 0; i < 52; i++) insertCatalogTrack(fixture.sqlite, { id: `page-${i}`, title: `曲目 ${String(i).padStart(2, '0')}` })
  const first = await (await getCatalog()).json() as any
  expect(first.tracks).toHaveLength(50)
  expect(first.nextOffset).toBe(50)
  expect(first.hasMore).toBe(true)
  const second = await (await onRequestGet({ request: new Request('https://moodverse.test/api/music/catalog?offset=50'), env: createMusicApiEnv(fixture.db) } as never)).json() as any
  expect(second.tracks.map((t: any) => t.id)).toEqual(['page-50', 'page-51'])
  expect(second.hasMore).toBe(false)
})

test('catalog returns only active tracks and maps safe music metadata without writing', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'track-live', title: 'The 100% Real Song', artistName: 'A_Artist' })
  insertCatalogTrack(fixture.sqlite, { id: 'track-hidden', title: 'Unreleased', active: false })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET version_label = 'Live', genres_json = '["indie rock"]', mood_tags_json = '["hopeful"]',
        cover_url = 'https://images.example/cover.jpg', duration_seconds = 201
    WHERE id = 'track-live'
  `).run()

  const before = fixture.sqlite.prepare('SELECT count(*) AS count FROM music_track_catalog').get()
  const response = await getCatalog()
  const result = await response.json() as { tracks: Array<Record<string, unknown>> }

  expect(response.status).toBe(200)
  expect(result.tracks).toEqual([{
    id: 'track-live',
    title: 'The 100% Real Song',
    artistId: 'artist-1',
    artistName: 'A_Artist',
    versionLabel: 'Live',
    genres: ['indie rock'],
    moodTags: ['hopeful'],
    officialUrl: 'https://music.example/track/track-live',
    coverUrl: 'https://images.example/cover.jpg',
    durationSeconds: 201,
  }])
  expect(result.tracks[0]).not.toHaveProperty('provider')
  expect(result.tracks[0]).not.toHaveProperty('providerTrackId')
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_track_catalog').get()).toEqual(before)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM users').get()).toEqual({ count: 0 })
})

test('catalog search treats SQL wildcard characters literally across title and artist', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'track-special', title: 'The 100% Real Song', artistName: 'A_Artist' })
  insertCatalogTrack(fixture.sqlite, { id: 'track-other', title: 'The Real Song', artistName: 'Another Artist' })

  const percentResult = await (await getCatalog('%')).json() as { tracks: Array<{ id: string }> }
  const underscoreResult = await (await getCatalog('_')).json() as { tracks: Array<{ id: string }> }
  const artistResult = await (await getCatalog('another')).json() as { tracks: Array<{ id: string }> }

  expect(percentResult.tracks.map(({ id }) => id)).toEqual(['track-special'])
  expect(underscoreResult.tracks.map(({ id }) => id)).toEqual(['track-special'])
  expect(artistResult.tracks.map(({ id }) => id)).toEqual(['track-other'])
})

test('catalog omits HTTPS URLs containing embedded credentials', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'track-credentials' })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET official_url = 'https://provider-user:provider-secret@music.example/track',
        cover_url = 'https://image-user:image-secret@images.example/cover.jpg'
    WHERE id = 'track-credentials'
  `).run()

  const response = await getCatalog()
  const result = await response.json() as { tracks: Array<{ officialUrl: string | null; coverUrl: string | null }> }
  expect(result.tracks[0]).toMatchObject({ officialUrl: null, coverUrl: null })
})

test('catalog excludes fictional staging tracks from selectable music', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'demo:shoreline', title: '沿海线', artistName: '雾中航线' })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET provider = 'moodverse-demo', provider_track_id = 'example-001', official_url = ''
    WHERE id = 'demo:shoreline'
  `).run()

  const response = await getCatalog()
  const result = await response.json() as { tracks: Array<Record<string, unknown>> }

  expect(result.tracks).toEqual([])
})

test('Audius search persists canonical playable tracks, rejects gated tracks and never exposes the API key', async () => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('https://api.audius.co')
    expect(url.searchParams.get('query')).toBe('night')
    expect(url.searchParams.get('api_key')).toBe('test-key')
    return Response.json({ data: [
      { id: 'Ab123', title: 'Night Drive', user: { id: 'Us3r', name: 'Real Artist' }, genre: 'Rock', mood: 'Upbeat', bpm: 128,
        duration: 185, permalink: '/real-artist/night-drive', artwork: { '480x480': 'https://content.audius.co/cover.jpg' }, is_streamable: true },
      { id: 'Gate1', title: 'Paid', user: { id: 'Usr', name: 'Artist' }, is_stream_gated: true, is_streamable: true },
    ] })
  })
  const response = await onRequestGet({ request: new Request('https://moodverse.test/api/music/catalog?q=night'),
    env: createMusicApiEnv(fixture.db, { AUDIUS_API_KEY: 'test-key' }) } as never)
  const body = await response.json() as any
  expect(body.tracks).toHaveLength(1)
  expect(body.tracks[0]).toMatchObject({ id: 'audius:Ab123', title: 'Night Drive', artistId: 'audius:Us3r', artistName: 'Real Artist',
    audioUrl: '/api/music/tracks/audius%3AAb123/stream', visualFeatures: { source: 'audius', tempoBpm: 128 } })
  expect(JSON.stringify(body)).not.toContain('test-key')
  expect(fixture.sqlite.prepare("SELECT provider, provider_track_id FROM music_track_catalog WHERE id='audius:Ab123'").get()).toMatchObject({ provider: 'audius', provider_track_id: 'Ab123' })
})

test('catalog exposes only bounded features with provenance, missing tempo stays missing', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'features' })
  const valid = { source: 'curated', tempoBpm: 120, energy: .6 }
  fixture.sqlite.prepare('UPDATE music_track_catalog SET visual_features_json=?').run(JSON.stringify(valid))
  expect((await (await getCatalog()).json() as any).tracks[0].visualFeatures).toEqual(valid)
  fixture.sqlite.prepare('UPDATE music_track_catalog SET visual_features_json=?').run('{"source":"tag-derived","energy":0.6}')
  expect((await (await getCatalog()).json() as any).tracks[0].visualFeatures).not.toHaveProperty('tempoBpm')
  fixture.sqlite.prepare('UPDATE music_track_catalog SET visual_features_json=?').run('{"source":"unknown","tempoBpm":140}')
  expect((await (await getCatalog()).json() as any).tracks[0]).not.toHaveProperty('visualFeatures')
})
