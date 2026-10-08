import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildMusicCatalogUpsertSql, normalizeMusicCatalogPayload } from '../scripts/music-catalog-import.mjs'

const track = (overrides: Record<string, unknown> = {}) => ({
  id: 'qqmusic:track-001',
  title: '海边的风',
  artistId: 'artist-001',
  artistName: '林间',
  versionLabel: '录音室版',
  genres: ['indie pop', 'ambient'],
  moodTags: ['calm', 'hopeful'],
  provider: 'qqmusic',
  providerTrackId: 'track-001',
  officialUrl: 'https://y.qq.com/n/ryqq/song/track-001',
  coverUrl: 'https://y.qq.com/cover/track-001.jpg',
  durationSeconds: 212,
  ...overrides,
})

test('normalizes a versioned catalog file and supplies safe optional defaults', () => {
  expect(normalizeMusicCatalogPayload({ version: 1, tracks: [track({ versionLabel: undefined, genres: undefined, moodTags: undefined, coverUrl: undefined, durationSeconds: undefined })] }))
    .toEqual([expect.objectContaining({
      id: 'qqmusic:track-001',
      versionLabel: '',
      genres: [],
      moodTags: [],
      coverUrl: null,
      durationSeconds: null,
      isActive: true,
    })])
})

test('rejects invalid links, missing identity fields, duplicates, and malformed tags', () => {
  expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track({ officialUrl: 'http://y.qq.com/song' })] }))
    .toThrow(/HTTPS/)
  expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track({ coverUrl: 'https://user:secret@y.qq.com/cover' })] }))
    .toThrow(/credentials/)
  expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track({ title: ' ' })] }))
    .toThrow(/title/)
  expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track(), track()] }))
    .toThrow(/duplicate/)
  expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track({ genres: ['ambient', 7] })] }))
    .toThrow(/genres/)
  const normalized = normalizeMusicCatalogPayload({ version: 1, tracks: [track()] })
  expect(() => buildMusicCatalogUpsertSql([{ ...normalized[0], durationSeconds: '0); DROP TABLE music_track_catalog; --' }]))
    .toThrow(/durationSeconds/)
})

test('generates an idempotent, SQL-escaped upsert without writing to a database', () => {
  const normalized = normalizeMusicCatalogPayload({ version: 1, tracks: [track({ title: "Quiet'; DROP TABLE music_track_catalog; --" })] })
  const sql = buildMusicCatalogUpsertSql(normalized, new Date('2026-09-30T00:00:00.000Z'))
  const database = new DatabaseSync(':memory:')
  database.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../migrations-music-staging/0002_dither_appearance.sql', import.meta.url), 'utf8'))
  try {
    database.exec(sql)
    expect(database.prepare('SELECT title, genres_json, mood_tags_json FROM music_track_catalog').get()).toEqual({
      title: "Quiet'; DROP TABLE music_track_catalog; --",
      genres_json: '["indie pop","ambient"]',
      mood_tags_json: '["calm","hopeful"]',
    })
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'music_track_catalog'").get()).toEqual({ name: 'music_track_catalog' })

    const updated = normalizeMusicCatalogPayload({ version: 1, tracks: [track({ title: '更新后的歌名', isActive: false })] })
    database.exec(buildMusicCatalogUpsertSql(updated, new Date('2026-10-01T00:00:00.000Z')))
    expect(database.prepare('SELECT title, is_active, created_at, updated_at FROM music_track_catalog').get()).toEqual({
      title: '更新后的歌名',
      is_active: 0,
      created_at: '2026-09-30T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    })
  } finally {
    database.close()
  }
})

test('catalog import preserves sourced optional music features and rejects fabricated or unsafe values', () => {
  const visualFeatures = { source: 'curated', tempoBpm: 140, energy: .8, hardness: .7, acousticness: .2 }
  const normalized = normalizeMusicCatalogPayload({ version: 1, tracks: [track({ visualFeatures })] })
  expect(normalized[0].visualFeatures).toEqual(visualFeatures)
  const sql = buildMusicCatalogUpsertSql(normalized)
  expect(sql).toContain('visual_features_json')
  for (const invalid of [{ source: 'guessed', tempoBpm: 100 }, { source: 'tag-derived', tempoBpm: 100 }, { source: 'demo', energy: 4 }, { source: 'demo', url: 'x' }, null]) {
    expect(() => normalizeMusicCatalogPayload({ version: 1, tracks: [track({ visualFeatures: invalid })] })).toThrow(/visualFeatures/)
  }
})
