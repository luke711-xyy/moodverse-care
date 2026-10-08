import { expect, test } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { hitTestDitherAssets, orbitPoint, satelliteAsset } from '../src/music/dither/layout'
import { sampleDitherPixel } from '../src/music/dither/sampler'

const spec = createDitherSpec({ planetId: 'layout', tracks: [] })
test('a tilted 2D orbit is periodic, stable and remains within its ellipse bounds', () => {
  const orbit = { x: 120, y: 100, rx: 80, ry: 35, tilt: .4 }
  expect(orbitPoint(orbit, .7).x).toBeCloseTo(orbitPoint(orbit, .7 + Math.PI * 2).x)
  expect(orbitPoint(orbit, .7).y).toBeCloseTo(orbitPoint(orbit, .7 + Math.PI * 2).y)
  expect(orbitPoint({ ...orbit, tilt: 0 }, 0)).toEqual({ x: 200, y: 100 })
  expect(orbitPoint({ ...orbit, tilt: 0 }, Math.PI / 2).y).toBeCloseTo(135)
})
test('hit testing follows visible shapes and painter order, not square bounds or glow halos', () => {
  const star = { id: 'star', spec, x: 100, y: 100, radius: 60, kind: 'star' as const }
  const planet = { id: 'planet', spec, x: 150, y: 100, radius: 40 }
  expect(hitTestDitherAssets([star, planet], 150, 100)?.id).toBe('planet')
  expect(hitTestDitherAssets([star, planet], 100, 100)?.id).toBe('star')
  expect(hitTestDitherAssets([star], 170, 170)).toBeNull()
  expect(hitTestDitherAssets([{ ...planet, opacity: 0 }], 150, 100)).toBeNull()
})
test('friend and music satellites use reproducible individual seeds and shared palette', () => {
  const orbit = { x: 100, y: 100, rx: 80, ry: 35, tilt: 0 }
  const music = satelliteAsset(spec, { id: 'track:1', kind: 'music', orbit, phase: .4, radius: 15 })
  const friend = satelliteAsset(spec, { id: 'friend:1', kind: 'friend', orbit, phase: .4, radius: 15 })
  expect(satelliteAsset(spec, { id: 'track:1', kind: 'music', orbit, phase: .4, radius: 15 })).toEqual(music)
  expect(music.kind).toBe('music')
  expect(friend.spec.seed).not.toBe(music.spec.seed)
  expect(friend.spec.overrides.form).toBe('particles')
  expect(music.spec.generated.blue).toBe(spec.generated.blue)
})

test('rotated hit areas use the inverse of the painted shape rotation', () => {
  const rotation = .7
  const rotatedSpec = { ...spec, overrides: { form: 'organic' as const, size: 1 } }
  let point: { x: number; y: number } | undefined
  for (let x = -.95; x < .95 && !point; x += .05) {
    for (let y = -.95; y < .95 && !point; y += .05) {
      const wrongX = x * Math.cos(2 * rotation) - y * Math.sin(2 * rotation)
      const wrongY = x * Math.sin(2 * rotation) + y * Math.cos(2 * rotation)
      if (sampleDitherPixel(rotatedSpec, x, y)[3] > 90 && sampleDitherPixel(rotatedSpec, wrongX, wrongY)[3] <= 90) point = { x, y }
    }
  }
  expect(point).toBeDefined()
  const screenX = 100 + 60 * (point!.x * Math.cos(rotation) - point!.y * Math.sin(rotation))
  const screenY = 100 + 60 * (point!.x * Math.sin(rotation) + point!.y * Math.cos(rotation))
  expect(hitTestDitherAssets([{ id: 'rotated', spec: rotatedSpec, x: 100, y: 100, radius: 60, rotation }], screenX, screenY)?.id).toBe('rotated')
})
