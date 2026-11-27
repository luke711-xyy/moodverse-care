import { expect, test } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createDitherMotion } from '../src/music/dither/motion'
import { buildDitherStageFrame } from '../src/music/dither/stage-layout'

const owner = createDitherSpec({ planetId: 'owner', tracks: [] })
const input = { width: 2000, height: 1400, phase: 0, owner, systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [] }

test('own planet has a denser visible star field without increasing Galaxy or visited planets', () => {
  const home = buildDitherStageFrame(input)
  const galaxy = buildDitherStageFrame({ ...input, home: 0 })
  const visitor = buildDitherStageFrame({ ...input, visitor: owner })
  for (const frame of [home, galaxy, visitor]) createDitherMotion().apply(frame, 0, 0, false, false)
  expect(galaxy.background!.stars.count).toBe(240)
  expect(visitor.background!.stars.count).toBe(240)
  expect(home.background!.stars.count).toBeGreaterThan(galaxy.background!.stars.count * 4)
  // The home canvas overscans 2x on both axes; measure the central viewport.
  const visibleCount = (frame: typeof home) => {
    const { count, points } = frame.background!.stars
    let visible = 0
    for (let i = 0; i < count; i++) {
      const x = points[i * 6], y = points[i * 6 + 1]
      if (x >= 500 && x <= 1500 && y >= 350 && y <= 1050) visible++
    }
    return visible
  }
  expect(visibleCount(home)).toBeGreaterThan(visibleCount(galaxy) * 4)
})

test('home star identities and pointer motion survive redraws and resizing', () => {
  const engine = createDitherMotion()
  const home = buildDitherStageFrame(input)
  engine.apply(home, 0, 0, false, false)
  const points = home.background!.stars.points
  home.pointer = { x: points[0] + 8, y: points[1] + 8 }
  for (let i = 0; i < 10; i++) engine.apply(home, 1 / 60, i / 60, true, false)
  const moved = points.slice(0, 2)
  engine.apply(home, 0, 9 / 60, false, false)
  expect(home.background!.stars.points).toBe(points)
  expect(points.slice(0, 2)).toEqual(moved)
  home.width = 2200
  engine.apply(home, 0, 9 / 60, false, false)
  expect(home.background!.stars.points).toBe(points)
  expect([...points].every(Number.isFinite)).toBe(true)
})
