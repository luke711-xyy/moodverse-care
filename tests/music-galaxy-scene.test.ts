import { expect, test } from 'vitest'
import { buildMusicGalaxySceneSystems } from '../src/music/galaxy-scene'
import { createDitherSpec, isDitherSpec } from '../src/music/dither/appearance'
import { buildDitherStageFrame, sampleHomeTransition } from '../src/music/dither/stage-layout'

const visual = createDitherSpec({ planetId: 'planet-a', tracks: [] })
const groups = [{ key: 'ambient', label: 'Ambient', planetCount: 1, planets: [{ planetId: 'planet-a', displayName: '夜航者', tagline: '', reasonCode: 'same_genre' as const, visual }] }]
test.each(['song','artist','genre'] as const)('%s star artwork reaches the rendered central star without changing orbiting planets', by => {
  const artwork = {url:'https://covers.example/album.jpg',source:'song-cover' as const,label:'真实封面'}
  const systems=buildMusicGalaxySceneSystems(by,[{...groups[0],artwork}])
  const frame=buildDitherStageFrame({width:1000,height:700,phase:0,owner:visual,systems,home:0,journey:0,rotation:0,friends:[],music:[]})
  const star=frame.assets.find(asset=>asset.id===`system:${by}:ambient`)!
  expect(star.spec.coverTexture?.url).toBe(artwork.url)
  expect(isDitherSpec(star.spec)).toBe(true)
  expect(frame.assets.find(asset=>asset.id==='planet:planet-a')?.spec).toEqual(visual)
})
test('unsafe or absent artwork never becomes a star texture', () => {
  for(const url of ['javascript:alert(1)','https://user:secret@covers.example/album.jpg','http://covers.example/album.jpg']) {
    const systems=buildMusicGalaxySceneSystems('song',[{...groups[0],artwork:{url,source:'song-cover' as const,label:'封面'}}])
    expect(systems[0].starSpec?.coverTexture).toBeUndefined()
  }
})
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
  const input = { width: 1000, height: 700, phase: .4, owner: visual, systems: buildMusicGalaxySceneSystems('genre', groups), home: 1, journey: 0, rotation: 0, friends: [{ id: 'friend-a', isVirtual: false }], music: [{ id: 'song-a' }] }
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
