import { expect, test } from 'vitest'

import { hashString32, isPlanetLand, largestLandFocus } from '../src/planet-visuals.ts'

test('doodle placement deterministically targets land in the largest landmass', () => {
  for (const id of ['self', 'seed-care-02', 'a-remotely-created-planet']) {
    const seed = hashString32(id)
    const first = largestLandFocus(seed, .12)
    const second = largestLandFocus(seed, .12)

    expect(first).toEqual(second)
    expect(isPlanetLand(seed, first.longitude, first.latitude, .12)).toBe(true)
    expect(first.clearance).toBeGreaterThanOrEqual(0)
  }
})
