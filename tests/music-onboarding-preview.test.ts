import { afterEach, expect, test, vi } from 'vitest'
import { createCockpitPreviewApi } from '../src/music/cockpit/Preview'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const draft = {
  displayName: '新的声音', tagline: '从这里出发', visibility: 'private' as const,
  trackIds: ['preview-song-2', 'preview-song-0', 'preview-song-1'],
}

test('a first-run preview saves the chosen planet only inside its own fake session', async () => {
  const api = createCockpitPreviewApi('?first-run=1')
  expect((await api.loadHome()).planet).toBeNull()

  const { planet } = await api.createPlanet(draft)
  expect(planet).toMatchObject({ displayName: '新的声音', tagline: '从这里出发', visibility: 'private', visualSchemaVersion: 3,
    tracks: [{ id: 'preview-song-2', position: 0, isPrimary: true }, { id: 'preview-song-0', position: 1, isPrimary: false }, { id: 'preview-song-1', position: 2, isPrimary: false }] })
  expect((await api.loadHome()).planet?.id).toBe(planet.id)
  await expect(api.createPlanet({ ...draft, displayName: '重复创建' })).rejects.toMatchObject({ status: 409, code: 'PLANET_ALREADY_EXISTS' })
  expect((await api.loadHome()).planet?.displayName).toBe('新的声音')
  expect((await createCockpitPreviewApi('?first-run=1').loadHome()).planet).toBeNull()
  expect((await createCockpitPreviewApi().loadHome()).planet?.displayName).toBe('夜航者')
})

test('a controlled creation failure leaves the first-run owner empty', async () => {
  const api = createCockpitPreviewApi('?first-run=1&create-fail=1')
  await expect(api.createPlanet(draft)).rejects.toMatchObject({ status: 503, code: 'PREVIEW_CREATE_FAILED' })
  expect((await api.loadHome()).planet).toBeNull()
})

test('preview genre, artist and song preferences survive partial updates independently', async () => {
  const api = createCockpitPreviewApi('?first-run=1')
  await api.updateGalaxyPreferences({ genres: ['Ambient'], artists: ['preview-artist-0'], songs: ['preview-song-1'] })
  await api.updateGalaxyPreferences({ genres: ['Jazz'] })
  expect(await api.loadGalaxyPreferences()).toMatchObject({ genres: ['Jazz'], availableGenres: expect.arrayContaining(['Ambient', 'Jazz']),
    artists: [{ id: 'preview-artist-0', label: '星际旅人' }], songs: [{ id: 'preview-song-1', label: '潮汐之间 · 潮汐' }] })
  await api.updateGalaxyPreferences({ artists: [] })
  expect(await api.loadGalaxyPreferences()).toMatchObject({ artists: [], songs: [{ id: 'preview-song-1' }], genres: ['Jazz'] })
  await expect(api.updateGalaxyPreferences({ genres: ['Rock'], songs: ['unknown'] })).rejects.toMatchObject({ status: 400 })
  expect((await api.loadGalaxyPreferences()).genres).toEqual(['Jazz'])
})

test.each(['artist', 'song'] as const)('preview %s options support search and non-overlapping pagination', async by => {
  const api = createCockpitPreviewApi('?first-run=1')
  const first = await api.searchGalaxyOptions(by)
  expect(first.options).toHaveLength(12)
  expect(first).toMatchObject({ hasMore: true, nextOffset: 12 })
  const second = await api.searchGalaxyOptions(by, '', first.nextOffset!)
  expect(second.options.length).toBeGreaterThan(0)
  expect(second).toMatchObject({ hasMore: false, nextOffset: null })
  expect(second.options.some(option => first.options.some(previous => previous.id === option.id))).toBe(false)
  expect((await api.searchGalaxyOptions(by, '星际旅人')).options).toEqual([
    by === 'artist' ? { id: 'preview-artist-0', label: '星际旅人' } : { id: 'preview-song-0', label: '夜航 · 星际旅人' },
  ])
  expect((await api.searchGalaxyOptions(by, '不存在的音乐')).options).toEqual([])
})

test('home-delay keeps the fake owner request pending until the controlled delay expires', async () => {
  vi.useFakeTimers()
  const api = createCockpitPreviewApi('?first-run=1&home-delay=500')
  let ready = false
  const home = api.loadHome().then(value => { ready = true; return value })
  await vi.advanceTimersByTimeAsync(499)
  expect(ready).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect((await home).planet).toBeNull()
})

test('unsupported preview routes fail locally instead of falling through to a real fetch', async () => {
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected external request') })
  const api = createCockpitPreviewApi('?first-run=1')
  await expect(api.loadBlocks()).rejects.toMatchObject({ status: 404, code: 'PREVIEW_NOT_IMPLEMENTED' })
})
