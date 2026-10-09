import { expect, test } from 'vitest'
import { advanceFlight, type CockpitFlight } from '../src/music/cockpit/flight'
import { buildCockpitFlightFrame } from '../src/music/cockpit/flight-frame'
import { createDitherSpec } from '../src/music/dither/appearance'

test('slow flight holds in the cloud; reduced motion still waits for destination data', () => {
  expect(advanceFlight(.499, 50, false, false)).toBe(.5)
  expect(advanceFlight(.5, 50, false, false)).toBe(.5)
  expect(advanceFlight(.5, 50, true, false)).toBeGreaterThan(.5)
  expect(advanceFlight(0, 50, false, true)).toBe(.5)
  expect(advanceFlight(0, 50, true, true)).toBe(1)
})
test('home arrival grows from a point; reverse departure shrinks completely before leaving the cloud', () => {
  const input = { width: 1000, height: 700, phase: 0, owner: createDitherSpec({ planetId: 'home', tracks: [] }), systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [] }
  const trip: CockpitFlight = { token: 1, from: 'galaxy', to: 'home', progress: .51, ready: true, sourceVisitor: null, targetVisitor: null, returning: false }
  const small = buildCockpitFlightFrame(input, trip).assets.find(a => a.id.startsWith('home:'))!
  const full = buildCockpitFlightFrame(input, { ...trip, progress: 1 }).assets.find(a => a.id.startsWith('home:'))!
  expect(small.radius).toBeLessThan(full.radius * .03)
  expect(small.opacity).toBeLessThan(.03)
  const reverse = buildCockpitFlightFrame(input, { ...trip, from: 'home', to: 'galaxy', progress: .49 }).assets.find(a => a.id.startsWith('home:'))!
  expect(reverse.radius).toBeCloseTo(small.radius)
  expect(reverse.opacity).toBeCloseTo(small.opacity!)
  expect(buildCockpitFlightFrame(input, { ...trip, progress: .5 }).assets.find(a => a.id === 'nebula')?.opacity).toBe(.92)
})
