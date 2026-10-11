import { expect, test } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { buildDitherStageFrame, type StageLayoutInput } from '../src/music/dither/stage-layout'

const owner = createDitherSpec({ planetId: 'differential-orbits', tracks: [] })
const input: StageLayoutInput = {
  width: 1000, height: 700, phase: 0, owner, systems: [], home: 1, journey: 0, rotation: 0,
  music: Array.from({ length: 5 }, (_, i) => ({ id: `song-${i}` })),
  friends: Array.from({ length: 5 }, (_, i) => ({ id: `friend-${i}`, isVirtual: false })),
}
const satellites = (frame: ReturnType<typeof buildDitherStageFrame>) => frame.assets.filter(asset => /^(music|friend):/.test(asset.id))
const speeds = (scene: StageLayoutInput) => {
  const start = satellites(buildDitherStageFrame({ ...scene, phase: 0 }))
  const later = satellites(buildDitherStageFrame({ ...scene, phase: 1 }))
  return new Map(start.map(asset => [asset.id, later.find(next => next.id === asset.id)!.rotation! - asset.rotation!]))
}

test.each(['home', 'visitor'] as const)('%s satellites drift at distinct bounded speeds rather than staying phase-locked', kind => {
  const scene = kind === 'home' ? input : { ...input, visitor: owner, visitorFriends: input.friends }
  const values = [...speeds(scene).values()]
  expect(values).toHaveLength(10)
  for (const speed of values) {
    expect(speed).toBeGreaterThan(.08)
    expect(speed).toBeLessThan(.36)
  }
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    expect(Math.abs(values[i] - values[j])).toBeGreaterThan(.015)
  }
})

test('satellite speed assignment survives rerenders and list reordering without fresh randomness', () => {
  const first = speeds(input)
  expect(speeds(input)).toEqual(first)
  const reordered = speeds({ ...input, music: [...input.music].reverse(), friends: [...input.friends].reverse() })
  for (const [id, speed] of first) expect(reordered.get(id)).toBeCloseTo(speed, 12)
  const otherPlanet = speeds({ ...input, owner: createDitherSpec({ planetId: 'another-planet', tracks: [] }) })
  expect([...otherPlanet.values()]).not.toEqual([...first.values()])
})

test('differential motion remains continuous and keeps the existing orbit geometry', () => {
  const start = buildDitherStageFrame(input)
  const later = buildDitherStageFrame({ ...input, phase: 40 })
  const next = buildDitherStageFrame({ ...input, phase: 40.016 })
  expect(later.orbits).toEqual(start.orbits)
  expect(next.orbits).toEqual(start.orbits)
  for (const body of satellites(later)) {
    const following = next.assets.find(asset => asset.id === body.id)!
    expect(Math.hypot(following.x - body.x, following.y - body.y)).toBeLessThan(2)
    const initial = start.assets.find(asset => asset.id === body.id)!
    const expectedStep = (body.rotation! - initial.rotation!) / 40 * .016
    expect(following.rotation! - body.rotation!).toBeCloseTo(expectedStep, 10)
  }
})
