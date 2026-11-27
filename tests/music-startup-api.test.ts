import { expect, test } from 'vitest'
import { createMusicApi, type MusicPlanet, type MusicPlanetTrack } from '../src/music-api'

const ownedTrack: MusicPlanetTrack = {
  id: 'track-owned', title: '夜航', artistId: 'artist-night', artistName: '星际旅人', versionLabel: '',
  genres: ['Ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/night', coverUrl: null,
  durationSeconds: 215, audioUrl: '/audio/night.mp3', position: 0, isPrimary: true,
  selectedAt: '2026-10-13T00:00:00.000Z',
}
const catalogTrack = { ...ownedTrack, id: 'track-catalog', title: '晨光' }
const ownerPlanet: MusicPlanet = {
  id: 'planet-a', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public',
  visualSchemaVersion: 3, appearanceRevision: 0, createdAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z', tracks: [ownedTrack],
  visual: {
    schemaVersion: 3, engineVersion: 1, mappingVersion: 1, seed: 'planet-a', overrides: {},
    generated: {
      form: 'organic', motif: 'tide', algorithm: 'bayer8', size: 1, textureScale: .35,
      disturbance: .2, density: .45, pixelSize: 3, exposure: 1.2, contrast: 1.1, gamma: 1.05,
      blue: .65, violet: .5, pink: .2, glow: .3, speed: .3, pulse: .2, pointer: 'weak', seedOffset: 0,
    },
    musicFeatures: { tempoBpm: null, energy: .2, hardness: .1, acousticness: .5, source: 'tag-derived' },
  },
}
const satellite = {
  id: 'satellite-a', displayName: '小满', tagline: '沿着旋律散步。', color: '#77dec8',
  visualSeed: 'friend-mint', orbitRadius: .235, orbitPhase: .35, isVirtual: true, canRemove: true,
}
const pathOf = (input: RequestInfo | URL) => new URL(input.toString(), 'https://mosic.test').pathname

test('simultaneous home readers establish only one owner session', async () => {
  let releaseOwner!: () => void
  const ownerReady = new Promise<void>(resolve => { releaseOwner = resolve })
  const requested: string[] = []
  const api = createMusicApi(async input => {
    const path = pathOf(input)
    requested.push(path)
    if (path === '/api/music/catalog') return Response.json({ tracks: [catalogTrack] })
    await ownerReady
    return Response.json({ planet: ownerPlanet, friendSatellites: [satellite] })
  })

  const first = api.loadHome(), second = api.loadHome()
  releaseOwner()
  const [a, b] = await Promise.all([first, second])

  expect(a).toMatchObject({ planet: { id: 'planet-a' }, friendSatellites: [{ id: 'satellite-a' }] })
  expect(b).toEqual(a)
  expect(requested.filter(path => path === '/api/me/music-planet')).toHaveLength(1)
})

test('a completed home read never substitutes the preceding account on the next read', async () => {
  let activePlanet = ownerPlanet
  const api = createMusicApi(async input => pathOf(input) === '/api/music/catalog'
    ? Response.json({ tracks: [catalogTrack] })
    : Response.json({ planet: activePlanet, friendSatellites: [] }))

  expect((await api.loadHome()).planet?.id).toBe('planet-a')
  activePlanet = { ...ownerPlanet, id: 'planet-b', displayName: '晨光' }
  expect((await api.loadHome()).planet?.id).toBe('planet-b')
})

test('identity invalidation isolates pending home reads through the old request completion', async () => {
  let releaseOld!: (planet: MusicPlanet) => void
  let releaseFresh!: (planet: MusicPlanet) => void
  const oldIdentity = new Promise<MusicPlanet>(resolve => { releaseOld = resolve })
  const freshIdentity = new Promise<MusicPlanet>(resolve => { releaseFresh = resolve })
  let ownerReads = 0
  const api = createMusicApi(async input => {
    if (pathOf(input) === '/api/music/catalog') return Response.json({ tracks: [catalogTrack] })
    const planet = await (++ownerReads === 1 ? oldIdentity : freshIdentity)
    return Response.json({ planet, friendSatellites: [] })
  })

  const oldHome = api.loadHome()
  api.invalidateHome?.()
  const freshHome = api.loadHome()
  releaseOld(ownerPlanet)
  expect((await oldHome).planet?.id).toBe('planet-a')

  // A stale request finishing must leave the replacement request shared.
  const anotherFreshHome = api.loadHome()
  releaseFresh({ ...ownerPlanet, id: 'planet-b', displayName: '晨光' })
  const [fresh, anotherFresh] = await Promise.all([freshHome, anotherFreshHome])

  expect(fresh.planet?.id).toBe('planet-b')
  expect(anotherFresh.planet?.id).toBe('planet-b')
  expect(ownerReads).toBe(2)
})

test('a rejected owner read remains an error and a later read can reconnect', async () => {
  let ownerAvailable = false
  const api = createMusicApi(async input => {
    if (pathOf(input) === '/api/music/catalog') return Response.json({ tracks: [catalogTrack] })
    return ownerAvailable
      ? Response.json({ planet: ownerPlanet, friendSatellites: [] })
      : Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  })

  await expect(api.loadHome()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
  ownerAvailable = true
  await expect(api.loadHome()).resolves.toMatchObject({ planet: { id: 'planet-a' } })
})

test.each([
  { label: 'existing planet', planet: ownerPlanet, expectedTracks: ['track-owned'] },
  { label: 'new device', planet: null, expectedTracks: [] },
])('catalog failure preserves the confirmed owner state for $label', async ({ planet, expectedTracks }) => {
  const api = createMusicApi(async input => pathOf(input) === '/api/music/catalog'
    ? Response.json({ error: 'CATALOG_UNAVAILABLE' }, { status: 503 })
    : Response.json({ planet, friendSatellites: [satellite] }))

  const home = await api.loadHome()

  expect(home.planet?.id ?? null).toBe(planet?.id ?? null)
  expect(home.tracks.map(track => track.id)).toEqual(expectedTracks)
  expect(home.friendSatellites.map(friend => friend.id)).toEqual(['satellite-a'])
})

test('catalog reads recover on the next home load after provider failure', async () => {
  let catalogAvailable = false
  const api = createMusicApi(async input => {
    if (pathOf(input) === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (!catalogAvailable) throw new TypeError('Network unavailable')
    return Response.json({ tracks: [catalogTrack] })
  })

  expect((await api.loadHome()).tracks.map(track => track.id)).toEqual(['track-owned'])
  catalogAvailable = true
  expect((await api.loadHome()).tracks.map(track => track.id)).toEqual(['track-catalog'])
})
