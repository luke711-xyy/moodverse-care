import { expect, test } from 'vitest'
import { buildMusicGalaxySceneSystems } from '../src/music/galaxy-scene'
import { createDitherSpec } from '../src/music/dither/appearance'
import { buildDitherStageFrame, sampleHomeTransition } from '../src/music/dither/stage-layout'

const visual = createDitherSpec({ planetId: 'planet-a', tracks: [] })
const groups = [{ key: 'ambient', label: 'Ambient', planetCount: 1, planets: [{ planetId: 'planet-a', displayName: '夜航者', tagline: '', reasonCode: 'same_genre' as const, visual }] }]
test('Galaxy descriptors contain stable 2D specs, no old camera/terrain fields', () => {
  const systems = buildMusicGalaxySceneSystems('genre', groups)
  expect(systems[0].planets[0].spec).toEqual(visual)
  expect(systems[0]).not.toHaveProperty('anchor')
  expect(systems[0].planets[0]).not.toHaveProperty('position')
  expect(buildMusicGalaxySceneSystems('artist', groups)[0].planets[0].spec).toEqual(visual)
})
test('home transition is reversible and grows continuously', () => {
  expect(sampleHomeTransition(0)).toEqual({ homeScale: .025, homeOpacity: 0, cloudOpacity: 0 })
  expect(sampleHomeTransition(1)).toEqual({ homeScale: 1, homeOpacity: 1, cloudOpacity: 0 })
  expect(sampleHomeTransition(.5).cloudOpacity).toBeGreaterThan(.9)
  const samples = [.1, .3, .6, .8].map(sampleHomeTransition)
  expect([...samples].reverse()).toEqual([.8, .6, .3, .1].map(sampleHomeTransition))
  expect(samples.map(x=>x.homeScale)).toEqual([...samples.map(x=>x.homeScale)].sort((a,b)=>a-b))
})
test('shared frame lays out planets, friend and music satellites', () => {
  const input = { width: 1000, height: 700, phase: .4, owner: visual, systems: buildMusicGalaxySceneSystems('genre', groups), home: 1, journey: 0, rotation: 0, friends: [{ id: 'friend-a' }], music: [{ id: 'song-a' }] }
  const home = buildDitherStageFrame(input)
  expect(home.assets.map(x=>x.id)).toEqual(expect.arrayContaining(['home:planet-a','friend:friend-a','music:song-a']))
  const galaxy = buildDitherStageFrame({ ...input, home: 0, focusedGalaxy: 'genre:ambient' })
  expect(galaxy.assets.find(x=>x.id === 'planet:planet-a')?.spec).toEqual(visual)
  expect(home.assets.every(x=>Number.isFinite(x.x+x.y+x.radius))).toBe(true)
})
test('the hero fits a narrow viewport', () => {
  const frame = buildDitherStageFrame({ width: 320, height: 700, phase: 0, owner: visual, systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [] })
  const hero = frame.assets.find(x=>x.id === 'home:planet-a')!
  expect(hero.x - hero.radius).toBeGreaterThanOrEqual(0)
  expect(hero.x + hero.radius).toBeLessThanOrEqual(320)
})
