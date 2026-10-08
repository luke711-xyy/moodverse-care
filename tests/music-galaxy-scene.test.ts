import { expect, test } from 'vitest'
import { buildMusicGalaxySceneSystems } from '../src/music/galaxy-scene'

test('Galaxy grouping creates distinct orbit anchors while preserving a planet appearance across categories', () => {
  const visual = {
    schemaVersion: 2,
    summary: '夜色海岸',
    palette: { surface: '#347c68', ocean: '#071d31', accent: '#72dac0' },
    atmosphere: 'mist' as const,
    motion: 'flow' as const,
    particleDensity: 0.34,
  }
  const songSystems = buildMusicGalaxySceneSystems('song', [
    { key: 'song-a', label: '夜航', planetCount: 1, planets: [{ planetId: 'planet-a', displayName: '夜航者', tagline: '慢慢靠岸', reasonCode: 'same_song', visual }] },
    { key: 'song-b', label: '潮汐', planetCount: 1, planets: [{ planetId: 'planet-b', displayName: '潮汐边', tagline: '风经过这里', reasonCode: 'same_song' }] },
  ])
  const genreSystems = buildMusicGalaxySceneSystems('genre', [
    { key: 'ambient', label: 'Ambient', planetCount: 1, planets: [{ planetId: 'planet-a', displayName: '夜航者', tagline: '慢慢靠岸', reasonCode: 'same_genre', visual }] },
  ])

  expect(songSystems).toHaveLength(2)
  expect(songSystems[0].anchor.position).not.toEqual(songSystems[1].anchor.position)
  expect(songSystems[0].planets[0].visualOverride).toMatchObject({ surface: '#347c68', ocean: '#071d31', accent: '#72dac0' })
  expect(genreSystems[0].planets[0].visualOverride).toEqual(songSystems[0].planets[0].visualOverride)
  expect(genreSystems[0].planets[0].id).toBe(songSystems[0].planets[0].id)
})
