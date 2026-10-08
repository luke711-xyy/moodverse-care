import { describe, expect, test } from 'vitest'
import { createDitherSpec, DITHER_FORMS, DITHER_MOTIFS } from '../src/music/dither/appearance'
import { sampleDitherPixel, renderDitherImage, advanceDitherPhase, ditherThreshold } from '../src/music/dither/sampler'

const spec = createDitherSpec({ planetId: 'render', tracks: [] })
describe('2D dither assets', () => {
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
  test('flower has bright rounded anthers at the filament tips, not just spiral stripes', () => {
    const flower = { ...spec, overrides: { motif: 'flower' as const, form: 'organic' as const } }
    const tip = sampleDitherPixel(flower, .79, 0, 0, 16, 16)
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
