import { afterEach, beforeEach, expect, test } from 'vitest'
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

afterEach(() => fixture.close())

async function getCatalog(query = '') {
  const request = new Request(`https://moodverse.test/api/music/catalog${query ? `?q=${encodeURIComponent(query)}` : ''}`)
  return onRequestGet({ request, env: createMusicApiEnv(fixture.db) } as never)
}

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

test('catalog marks fictional staging tracks and never exposes a fake playback URL', async () => {
  insertCatalogTrack(fixture.sqlite, { id: 'demo:shoreline', title: '沿海线', artistName: '雾中航线' })
  fixture.sqlite.prepare(`
    UPDATE music_track_catalog
    SET provider = 'moodverse-demo', provider_track_id = 'example-001', official_url = ''
    WHERE id = 'demo:shoreline'
  `).run()

  const response = await getCatalog()
  const result = await response.json() as { tracks: Array<Record<string, unknown>> }

  expect(result.tracks).toEqual([expect.objectContaining({
    id: 'demo:shoreline',
    title: '沿海线',
    artistName: '雾中航线',
    isDemo: true,
    officialUrl: null,
  })])
  expect(result.tracks[0]).not.toHaveProperty('provider')
  expect(result.tracks[0]).not.toHaveProperty('providerTrackId')
})
