import { expect, test } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createDitherCellField, stepParticleField, type ParticleField } from '../src/music/dither/motion'

// Rasterize the real square instances in their shared rotated basis. Count
// geometric holes, independently of the material's intentionally dark pixels.
function coverage(field: ParticleField, rotation: number, radius: number, center = { x: 0, y: 0 }, extent = .65) {
  const side = 240, pixels = new Uint8Array(side * side), cr = Math.cos(rotation), sr = Math.sin(rotation)
  const cx = center.x * cr + center.y * sr, cy = -center.x * sr + center.y * cr
  for (let i = 0; i < field.count; i++) {
    const p = i * 6, x = field.points[p] * cr + field.points[p + 1] * sr - cx
    const y = -field.points[p] * sr + field.points[p + 1] * cr - cy, half = field.points[p + 4] / radius / 2
    const left = Math.max(0, Math.ceil((x - half + extent) / (2 * extent) * side - .5))
    const right = Math.min(side - 1, Math.floor((x + half + extent) / (2 * extent) * side - .5))
    const top = Math.max(0, Math.ceil((y - half + extent) / (2 * extent) * side - .5))
    const bottom = Math.min(side - 1, Math.floor((y + half + extent) / (2 * extent) * side - .5))
    if (right < left) continue
    for (let row = top; row <= bottom; row++) pixels.fill(1, row * side + left, row * side + right + 1)
  }
  return pixels.reduce((sum, value) => sum + value, 0) / pixels.length
}

test.each([0, .47, 1.57])('a full-strength moving tide leaves no hairline holes between material cells (rotation=%s)', rotation => {
  const spec = createDitherSpec({ planetId: 'seam', tracks: [], overrides: { size: 1, pulse: 1, pointer: 'off', pixelSize: 6 } })
  const field = createDitherCellField(20), pose = { spec, rotation, radius: 120, phase: 0 }
  let minimum = 1
  for (let frame = 0; frame < 180; frame++) {
    stepParticleField(field, pose, 1 / 60, frame / 60, undefined, true)
    if (frame % 6 === 0) minimum = Math.min(minimum, coverage(field, rotation, 120))
  }
  expect(minimum).toBe(1)
})

test('seam coverage keeps intentional cursor openings, bounds cell growth, and reforms after release', () => {
  const spec = createDitherSpec({ planetId: 'seam-pointer', tracks: [], overrides: { size: 1, pulse: 0, pointer: 'strong', pixelSize: 6 } })
  const field = createDitherCellField(20), pose = { spec, rotation: 0, radius: 120, phase: 0 }, cursor = { x: .25, y: .1 }
  for (let frame = 0; frame < 60; frame++) stepParticleField(field, pose, 1 / 60, frame / 60, cursor, true)
  expect(coverage(field, 0, 120, cursor, .06)).toBeLessThan(.15)
  for (let i = 0; i < field.count; i++) expect(field.points[i * 6 + 4]).toBeLessThanOrEqual(9.6 + 1e-5)
  for (let frame = 0; frame < 300; frame++) stepParticleField(field, pose, 1 / 60, frame / 60, undefined, true)
  expect(coverage(field, 0, 120)).toBe(1)
})
