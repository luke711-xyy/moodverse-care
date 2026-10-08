import { afterEach, beforeEach, expect, test } from 'vitest'
import { onRequestGet } from '../functions/api/music/galaxy'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
import type { MusicGalaxyResponse } from '../src/music-api'

let fixture: ReturnType<typeof createMusicApiFixture>

beforeEach(() => {
  fixture = createMusicApiFixture()
  for (const track of [
    { id: 'song-a', title: '夜航', artistName: '星际旅人' },
    { id: 'song-b', title: '潮汐', artistName: '星际旅人' },
    { id: 'song-c', title: '雾灯', artistName: '雨季' },
    { id: 'song-hidden', title: '未发布曲目', artistName: '隐私艺人' },
    { id: 'song-inactive', title: '已下架', artistName: '下架艺人', active: false },
  ]) insertCatalogTrack(fixture.sqlite, track)

  fixture.sqlite.prepare(`UPDATE music_track_catalog SET genres_json = '[]'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET genres_json = '["ambient","dream pop"]' WHERE id = 'song-a'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET genres_json = '["dream pop"]' WHERE id = 'song-b'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET genres_json = '["ambient"]' WHERE id = 'song-c'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET artist_id = 'artist-c' WHERE id = 'song-c'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET artist_id = 'artist-hidden', artist_name = '隐私艺人' WHERE id = 'song-hidden'`).run()
  fixture.sqlite.prepare(`UPDATE music_track_catalog SET artist_id = 'artist-inactive', artist_name = '下架艺人' WHERE id = 'song-inactive'`).run()

  fixture.sqlite.prepare(`INSERT INTO users (id, token_hash, created_at, updated_at) VALUES
    ('user-public', 'hash-public', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
    ('user-private', 'hash-private', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`).run()
  fixture.sqlite.prepare(`INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at) VALUES
    ('planet-public', 'user-public', '夜航者', '跟着歌声靠岸', 'public', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
    ('planet-private', 'user-private', '只给自己', '不会进入发现', 'private', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`).run()
  fixture.sqlite.prepare(`INSERT INTO music_planet_tracks (planet_id, track_id, position, selected_at) VALUES
    ('planet-public', 'song-a', 0, '2026-09-01T00:00:00.000Z'),
    ('planet-public', 'song-b', 1, '2026-09-01T00:00:00.000Z'),
    ('planet-public', 'song-inactive', 2, '2026-09-01T00:00:00.000Z'),
    ('planet-private', 'song-hidden', 0, '2026-09-01T00:00:00.000Z')`).run()
  fixture.sqlite.prepare(`INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, published_at, created_at, updated_at) VALUES
    ('moment-public', 'planet-public', 'song-c', '公开 Moment', 'public', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
    ('moment-private', 'planet-public', 'song-hidden', '不可公开', 'private', NULL, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')`).run()
})

afterEach(() => fixture.close())

async function getGalaxy(by: string) {
  return onRequestGet({
    request: new Request(`https://moodverse.test/api/music/galaxy?by=${encodeURIComponent(by)}`),
    env: createMusicApiEnv(fixture.db),
  } as never)
}

test('Galaxy groups active public selections and published public Moments, deduplicating a planet within each group', async () => {
  const response = await getGalaxy('artist')
  const body = await response.json() as { groups: Array<{ key: string; label: string; planetCount: number; planets: Array<{ planetId: string; displayName: string; tagline: string; reasonCode: string }> }> }

  expect(response.status).toBe(200)
  expect(body.groups).toEqual([
    { key: 'artist-1', label: '星际旅人', planetCount: 1,
      planets: [{ planetId: 'planet-public', displayName: '夜航者', tagline: '跟着歌声靠岸', reasonCode: 'same_artist' }] },
    { key: 'artist-c', label: '雨季', planetCount: 1,
      planets: [{ planetId: 'planet-public', displayName: '夜航者', tagline: '跟着歌声靠岸', reasonCode: 'same_artist' }] },
  ])
  expect(JSON.stringify(body)).not.toContain('只给自己')
  expect(JSON.stringify(body)).not.toContain('隐私艺人')
  expect(JSON.stringify(body)).not.toContain('下架艺人')
  expect(JSON.stringify(body)).not.toContain('不可公开')
})

test('Galaxy groups the same public planet into every associated genre without requiring a shared song', async () => {
  const response = await getGalaxy('genre')
  const body = await response.json() as { groups: Array<{ key: string; label: string; planets: Array<{ planetId: string; displayName: string; tagline: string; reasonCode: string }> }> }

  expect(response.status).toBe(200)
  expect(body.groups.map(({ key, label }) => [key, label])).toEqual([
    ['ambient', 'ambient'],
    ['dream pop', 'dream pop'],
  ])
  expect(body.groups[0].planets).toEqual([{ planetId: 'planet-public', displayName: '夜航者', tagline: '跟着歌声靠岸', reasonCode: 'same_genre' }])
  expect(body.groups[1].planets).toEqual([{ planetId: 'planet-public', displayName: '夜航者', tagline: '跟着歌声靠岸', reasonCode: 'same_genre' }])
})

test('Galaxy rejects unknown grouping modes instead of silently changing the discovery rule', async () => {
  const response = await getGalaxy('mood')
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'INVALID_GROUPING' })
})

test('Galaxy includes only validated planet appearance data for rendering the public 3D scene', async () => {
  fixture.sqlite.prepare(`UPDATE music_planets SET visual_json = ?1 WHERE id = 'planet-public'`).run(JSON.stringify({
    schemaVersion: 2,
    summary: '海蓝色星球',
    palette: { surface: '#347c68', ocean: '#071d31', accent: '#72dac0' },
    atmosphere: 'mist',
    motion: 'flow',
    particleDensity: 0.34,
    terrainFeatures: { mountainRanges: 3, basins: 1, canyons: 2, escarpments: 1 },
  }))

  const response = await getGalaxy('artist')
  const body = await response.json() as MusicGalaxyResponse
  expect(body.groups[0].planets[0]).toMatchObject({ planetId: 'planet-public', visual: { palette: { surface: '#347c68' } } })

  fixture.sqlite.prepare(`UPDATE music_planets SET visual_json = ?1 WHERE id = 'planet-public'`).run('{"schemaVersion":2,"palette":{"surface":"url(javascript:alert(1))"}}')
  const invalidResponse = await getGalaxy('artist')
  const invalidBody = await invalidResponse.json() as { groups: Array<{ planets: Array<{ visual?: unknown }> }> }
  expect(invalidBody.groups[0].planets[0]).not.toHaveProperty('visual')
})
