import { expect, test } from 'vitest'

import { generateLightningPath } from '../src/lightning.ts'

test('lightning paths are deterministic per strike and change across strikes', () => {
  const visibleNormal: [number, number, number] = [0.18, 0.24, 0.95]
  const first = generateLightningPath(0x51a7, 0, visibleNormal, 0.16)

  expect(generateLightningPath(0x51a7, 0, visibleNormal, 0.16)).toEqual(first)
  expect(generateLightningPath(0x51a7, 1, visibleNormal, 0.16)).not.toEqual(first)
  expect(generateLightningPath(0x51a8, 0, visibleNormal, 0.16)).not.toEqual(first)
  expect(generateLightningPath(0x51a7, 0, visibleNormal, 0.16)).toHaveLength(7)
})

test('lightning starts in the cloud layer and terminates on the visible planet surface', () => {
  const visibleNormal: [number, number, number] = [0, 0, 1]
  const radius = 0.16
  const path = generateLightningPath(1234, 8, visibleNormal, radius)
  const pointRadius = ([x, y, z]: [number, number, number]) => Math.hypot(x, y, z)
  const endpointDot = path.at(-1)!.reduce((sum, value, index) => sum + value * visibleNormal[index], 0)

  expect(path.flat().every(Number.isFinite)).toBe(true)
  expect(pointRadius(path[0])).toBeCloseTo(radius * 1.24, 6)
  expect(pointRadius(path.at(-1)!)).toBeCloseTo(radius * 1.02, 6)
  expect(endpointDot).toBeGreaterThan(radius * .5)
})
