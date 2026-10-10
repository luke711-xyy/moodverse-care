import { expect, test } from 'vitest'
import { dragOrientation, IDENTITY_ORIENTATION, viewToBody } from '../src/music/dither/arcball'
import { bodyRadius, sphereSurface } from '../src/music/dither/sphere'
import { createDitherSpec } from '../src/music/dither/appearance'
import { renderDitherImage } from '../src/music/dither/sampler'
import { sampleDitherAssetAlpha } from '../src/music/dither/layout'

test('quarter-turns preserve a near-round rim while rotating the material, not the view-space light', () => {
  const pitch = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const
  expect(bodyRadius('particles', 0, 0, 0, pitch)).toBeCloseTo(.85)
  const vertical = bodyRadius('particles', Math.PI / 2, 0, 0, pitch)
  expect(vertical).toBeGreaterThan(.85 * .95)
  expect(vertical).toBeLessThanOrEqual(.85)
  const before = sphereSurface(0, 0, .85, 0)
  const after = sphereSurface(0, 0, .85, 0, 0, pitch)
  expect(after.x).toBeCloseTo(0)
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(.5)
  expect(after.light).toBe(before.light)
  expect(after.highlight).toBe(before.highlight)
})

test('arcball follows the pointer, composes around view axes and stays finite outside the body', () => {
  const center = { x: 100, y: 100 }
  const q = dragOrientation(IDENTITY_ORIENTATION, center, { x: 150, y: 100 }, center, 100)
  const normal = viewToBody(.5, 0, Math.sqrt(.75), q)
  expect(normal[0]).toBeCloseTo(0)
  expect(normal[1]).toBeCloseTo(0)
  expect(normal[2]).toBeCloseTo(1)
  const returned = dragOrientation(q, { x: 150, y: 100 }, center, center, 100)
  returned.forEach((n, i) => expect(n).toBeCloseTo(IDENTITY_ORIENTATION[i]))
  let rotation = q
  for (let i = 0; i < 100; i++) rotation = dragOrientation(rotation, { x: 100 + i, y: -1000 }, { x: -1000, y: 2000 + i }, center, 100)
  expect(Math.hypot(...rotation)).toBeCloseTo(1)
  const composed = viewToBody(0, 0, 1, dragOrientation(q, center, { x: 100, y: 150 }, center, 100))
  expect(Math.abs(composed[0])).toBeGreaterThan(.1)
  expect(Math.abs(composed[1])).toBeGreaterThan(.1)
})

test('rotated near-round bodies retain clickable rim pixels while their fallback material turns', () => {
  const spec = createDitherSpec({ planetId: 'arcball', tracks: [], overrides: { form: 'particles', size: 1, pulse: 0, glow: 0, pointer: 'off' } })
  const pitch = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const
  const asset = { id: 'home', spec, x: 150, y: 150, radius: 100 }
  expect(sampleDitherAssetAlpha(asset, 150, 230)).toBeGreaterThan(200)
  expect(sampleDitherAssetAlpha({ ...asset, orientation: pitch }, 150, 230)).toBeGreaterThan(200)
  expect(sampleDitherAssetAlpha({ ...asset, orientation: pitch }, 150, 250)).toBe(0)
  const before = renderDitherImage(spec, 48)
  const after = renderDitherImage(spec, 48, 0, 'planet', undefined, pitch)
  expect(after).not.toEqual(before)
})
