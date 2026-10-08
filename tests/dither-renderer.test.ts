import { describe, expect, test } from 'vitest'
import { createDitherSpec, DITHER_FORMS, DITHER_MOTIFS } from '../src/music/dither/appearance'
import { sampleDitherPixel, renderDitherImage, advanceDitherPhase, ditherThreshold } from '../src/music/dither/sampler'
import { sphereSurface } from '../src/music/dither/sphere'

const spec = createDitherSpec({ planetId: 'render', tracks: [] })
describe('2D dither assets', () => {
  test('planet textures wrap onto a lit spherical surface rather than matching the flat nebula field', () => {
    const planet = { ...spec, overrides: { form: 'organic' as const, motif: 'flow' as const, pointer: 'off' as const } }
    expect(renderDitherImage(planet, 80, .6, 'planet')).not.toEqual(renderDitherImage(planet, 80, .6, 'nebula'))
  })
  test('an unpulsed particle body changes its projected silhouette as the shape turns', () => {
    const body = { ...spec, overrides: { form: 'particles' as const, pulse: 0, glow: 0 } }
    const initial = renderDitherImage(body, 96, 0), quarterTurn = renderDitherImage(body, 96, Math.PI / 2)
    let silhouetteChanges = 0
    for (let i = 3; i < initial.length; i += 4) if (initial[i] !== quarterTurn[i]) silhouetteChanges++
    expect(silhouetteChanges).toBeGreaterThan(100)
  })
  test('a stellar sphere has a stable lit hemisphere and a dimmer opposite hemisphere', () => {
    const sphere = { ...spec, overrides: { form: 'particles' as const, blue: 1, violet: 0, pink: 0, exposure: 1, contrast: 1, gamma: 1 } }
    const brightness = (side: number) => {
      let total = 0
      for (let x = .3; x < .55; x += .03) for (let y = .3; y < .55; y += .03) {
        total += sampleDitherPixel(sphere, side * x, side * y, 0, 8, 8, 'star').slice(0, 3).reduce((sum, n) => sum + n, 0)
      }
      return total
    }
    expect(brightness(-1)).toBeGreaterThan(brightness(1) * 1.35)
  })
  test('surface texture rotates through depth while the light remains still', () => {
    const front = sphereSurface(0, 0, .85, 0), turned = sphereSurface(0, 0, .85, Math.PI / 2)
    // A planar rotation never moves a texture at its center; a sphere does.
    expect(turned.x).toBeGreaterThan(front.x + .9)
    expect(turned.light).toBe(front.light)
    expect(front.depth).toBe(1)
    expect(sphereSurface(.85, 0, .85, 0).depth).toBe(0)
    const centerStep = sphereSurface(.01, 0, .85, 0).x - front.x
    const rimStep = sphereSurface(.83, 0, .85, 0).x - sphereSurface(.82, 0, .85, 0).x
    expect(rimStep).toBeGreaterThan(centerStep * 3)
    expect(sphereSurface(.2, .3, .85, 1e-6).x).toBeCloseTo(sphereSurface(.2, .3, .85, Math.PI * 2 - 1e-6).x, 5)
    const angle = .7, light = sphereSurface(.3, .2, .85, 0)
    const dragged = sphereSurface(.3 * Math.cos(angle) + .2 * Math.sin(angle), -.3 * Math.sin(angle) + .2 * Math.cos(angle), .85, 0, angle)
    expect(dragged.light).toBeCloseTo(light.light, 10)
    expect(dragged.highlight).toBeCloseTo(light.highlight, 10)
  })
  test('all forms have a transparent exterior rather than a square background', () => {
    for (const form of DITHER_FORMS) {
      expect(sampleDitherPixel({ ...spec, overrides: { form } }, 1.8, 1.8, 0)[3]).toBe(0)
      expect(renderDitherImage({ ...spec, overrides: { form } }, 64, 0).some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
    }
  })
  test('seven motifs render distinct bounded images with nonempty detail', () => {
    const fingerprints = new Set<string>()
    for (const motif of DITHER_MOTIFS) {
      const image = renderDitherImage({ ...spec, overrides: { form: 'organic', motif } }, 48, .6)
      expect(image.length).toBe(48 * 48 * 4)
      expect(image.some((v, i) => i % 4 !== 3 && v > 30)).toBe(true)
      fingerprints.add([...image].join(','))
    }
    expect(fingerprints.size).toBe(7)
  })
  test('fixed seed, dimensions and phase reproduce identical thumbnails', () => {
    expect(renderDitherImage(spec, 32, 0)).toEqual(renderDitherImage(spec, 32, 0))
    expect(renderDitherImage({ ...spec, seed: 'different' }, 32, 0)).not.toEqual(renderDitherImage(spec, 32, 0))
  })
  test('motion is periodic and grain does not randomize between frames', () => {
    for (const motif of DITHER_MOTIFS) {
      const planet = { ...spec, overrides: { motif } }
      expect(renderDitherImage(planet, 32, .5)).toEqual(renderDitherImage(planet, 32, .5 + Math.PI * 2))
    }
    expect(ditherThreshold('bayer8', 3, 4, 123)).toBe(ditherThreshold('bayer8', 11, 12, 123))
  })
  test('paused and reduced-motion clocks do not advance, speed changes do not jump', () => {
    expect(advanceDitherPhase(1.2, .05, 1, false)).toBe(1.2)
    expect(advanceDitherPhase(1.2, 0, 1.5, true)).toBe(1.2)
    expect(advanceDitherPhase(1.2, .05, 0, true)).toBe(1.2)
    expect(advanceDitherPhase(1.2, .05, 1, true)).toBeCloseTo(1.21)
    expect(advanceDitherPhase(0, 100, 1, true)).toBeCloseTo(.01)
  })
  test('image sizing is bounded so malformed values cannot allocate enormous buffers', () => {
    expect(() => renderDitherImage(spec, NaN)).toThrow()
    expect(() => renderDitherImage(spec, 0)).toThrow()
    expect(() => renderDitherImage(spec, 10000)).toThrow()
  })
  test('underlying flower field retains rounded anthers before spherical projection', () => {
    const flower = { ...spec, overrides: { motif: 'flower' as const, form: 'organic' as const } }
    // .79 is a material coordinate, not a fixed screen coordinate on a sphere.
    const tip = sampleDitherPixel(flower, .79, 0, 0, 16, 16, 'nebula')
    expect(tip[0] + tip[1] + tip[2]).toBeGreaterThan(350)
  })
  test('CPU fallback retains different star and record-disc silhouettes and detail', () => {
    const planet = renderDitherImage(spec, 48, 0, 'planet')
    const star = renderDitherImage(spec, 48, 0, 'star')
    const music = renderDitherImage(spec, 48, 0, 'music')
    expect(star).not.toEqual(planet)
    expect(music).not.toEqual(planet)
    expect(sampleDitherPixel(spec, 0, 0, 0, 8, 8, 'music').slice(0, 3).reduce((a, b) => a + b, 0)).toBeLessThan(80)
    expect(sampleDitherPixel(spec, 0, 0, 0, 8, 8, 'star').slice(0, 3).reduce((a, b) => a + b, 0)).toBeGreaterThan(350)
  })
})
