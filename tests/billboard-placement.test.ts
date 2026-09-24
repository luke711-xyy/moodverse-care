import { expect, test } from 'vitest'
import * as THREE from 'three'
import { placeBillboards } from '../src/billboard-placement.ts'
import type { Billboard } from '../src/types.ts'

const billboards = (count: number): Billboard[] => Array.from({ length: count }, (_, index) => ({
  id: `board-${index}`,
  kind: 'user',
  text: `A note for day ${index}`,
  createdAt: `2026-09-${String(index + 1).padStart(2, '0')}`,
}))

const facingDirection = new THREE.Vector3(0.28, 0.16, 0.94).normalize()

test('billboards use stable but scattered positions and stand upright from the surface', () => {
  const entries = billboards(7)
  const placements = placeBillboards(facingDirection, entries, 'planet-random-signs', 0.52, 0.08)
  const repeated = placeBillboards(facingDirection, entries, 'planet-random-signs', 0.52, 0.08)
  const uniquePositions = new Set(placements.map(({ position }) => position.toArray().map((value) => value.toFixed(5)).join(',')))

  expect(placements).toHaveLength(entries.length)
  expect(uniquePositions.size).toBe(entries.length)
  expect(placements.map(({ position }) => position.toArray())).toEqual(repeated.map(({ position }) => position.toArray()))
  for (const placement of placements) {
    const radialUp = placement.position.clone().normalize()
    const signUp = new THREE.Vector3(0, 1, 0).applyQuaternion(placement.quaternion)
    expect(signUp.angleTo(radialUp)).toBeLessThan(1e-6)
    expect(radialUp.dot(facingDirection.clone().negate())).toBeGreaterThan(0.35)
  }
})

test('billboards sit on land when available and fall back to the water surface when land is unavailable', () => {
  const radius = 0.52
  const landSigns = placeBillboards(facingDirection, billboards(4), 'planet-land-signs', radius, 0)
  const waterSigns = placeBillboards(facingDirection, billboards(4), 'planet-water-signs', radius, 1)
  const waterRadius = radius * (0.982 + 1 * 0.03)

  expect(landSigns.every(({ position }) => position.length() > radius * 0.982)).toBe(true)
  expect(waterSigns.every(({ position }) => Math.abs(position.length() - waterRadius) < 1e-9)).toBe(true)
})
