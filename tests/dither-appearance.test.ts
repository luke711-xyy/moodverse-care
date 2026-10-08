import { describe, expect, test } from 'vitest'
import { createDitherSpec, isDitherSpec, resolveDitherSpec, effectiveDitherParameters, validateDitherOverrides, validateMusicVisualFeatures } from '../src/music/dither/appearance'
import type { MusicTrackSummary } from '../src/music-domain'

const song = (id: string, genres: string[] = [], extras: Partial<MusicTrackSummary> = {}): MusicTrackSummary => ({
  id, title: id, artistId: 'artist', artistName: 'Artist', versionLabel: '', genres, moodTags: [], officialUrl: null, coverUrl: null, durationSeconds: null, ...extras,
})

describe('deterministic dither appearance', () => {
  test('same stable identity and songs yields the same spec, not new random assets', () => {
    const input = { planetId: 'p-1', tracks: [song('a', ['ambient']), song('b', ['piano'])] }
    expect(createDitherSpec(input)).toEqual(createDitherSpec(input))
    expect(createDitherSpec(input).seed).toBe('p-1')
    expect(createDitherSpec(input).schemaVersion).toBe(3)
    expect(isDitherSpec(createDitherSpec(input))).toBe(true)
  })

  test('hard fast music makes faster, more disturbed, warmer artwork than acoustic music', () => {
    const hard = createDitherSpec({ planetId: 'same', tracks: [song('h', ['metal'], { visualFeatures: { source: 'curated', tempoBpm: 180, energy: .95, hardness: .95, acousticness: .05 } })] })
    const soft = createDitherSpec({ planetId: 'same', tracks: [song('s', ['piano'], { visualFeatures: { source: 'curated', tempoBpm: 70, energy: .2, hardness: .1, acousticness: .9 } })] })
    expect(hard.generated.speed).toBeGreaterThan(soft.generated.speed)
    expect(hard.generated.disturbance).toBeGreaterThan(soft.generated.disturbance)
    expect(hard.generated.pink).toBeGreaterThan(soft.generated.pink)
    expect(soft.generated.motif).toBe('score')
    expect(hard.generated.motif).toBe('digital')
  })

  test('primary song receives half the weight and remaining songs share half', () => {
    const spec = createDitherSpec({ planetId: 'weighted', tracks: [
      { ...song('a', [], { visualFeatures: { source: 'curated', energy: 1, hardness: 1, acousticness: 0 } }), isPrimary: true },
      song('b', [], { visualFeatures: { source: 'curated', energy: 0, hardness: 0, acousticness: 1 } }),
      song('c', [], { visualFeatures: { source: 'curated', energy: 0, hardness: 0, acousticness: 1 } }),
    ] })
    expect(spec.musicFeatures.energy).toBe(.5)
    expect(spec.musicFeatures.hardness).toBe(.5)
    expect(spec.musicFeatures.acousticness).toBe(.5)
  })

  test('one song has full weight, and tags do not fabricate measured BPM', () => {
    const spec = createDitherSpec({ planetId: 'single', tracks: [song('a', ['metal'])] })
    expect(spec.musicFeatures.tempoBpm).toBeNull()
    expect(spec.musicFeatures.source).toBe('tag-derived')
    expect(spec.musicFeatures.energy).toBeGreaterThan(.5)
  })

  test('manual settings survive a song change, and resetting leaves new generated values', () => {
    const first = createDitherSpec({ planetId: 'p', tracks: [song('a', ['piano'])], overrides: { motif: 'flower', speed: .2, pink: .8 } })
    const next = createDitherSpec({ planetId: 'p', tracks: [song('b', ['metal'])], previous: first })
    expect(next.overrides).toEqual(first.overrides)
    expect(effectiveDitherParameters(next).motif).toBe('flower')
    expect(effectiveDitherParameters(next).speed).toBe(.2)
    const reset = createDitherSpec({ planetId: 'p', tracks: [song('b', ['metal'])], previous: next, overrides: {} })
    expect(reset.overrides).toEqual({})
    expect(effectiveDitherParameters(reset).motif).toBe('digital')
  })

  test('legacy and malformed records resolve deterministically without losing planet identity', () => {
    const tracks = [song('a', ['folk'])]
    const legacy = { schemaVersion: 2, palette: { surface: '#00aa00' }, terrainFeatures: {} }
    expect(resolveDitherSpec('legacy', tracks, legacy)).toEqual(createDitherSpec({ planetId: 'legacy', tracks }))
    expect(resolveDitherSpec('legacy', tracks, null).seed).toBe('legacy')
    expect(resolveDitherSpec('legacy', tracks, { schemaVersion: 3, generated: {} }).schemaVersion).toBe(3)
  })

  test('spec validator rejects malicious unbounded fields and arbitrary shader strings', () => {
    const spec = createDitherSpec({ planetId: 'p', tracks: [] })
    expect(isDitherSpec({ ...spec, generated: { ...spec.generated, speed: 99 } })).toBe(false)
    expect(isDitherSpec({ ...spec, overrides: { shader: 'execute' } })).toBe(false)
    expect(isDitherSpec({ ...spec, seed: '' })).toBe(false)
    expect(isDitherSpec({ ...spec, engineVersion: 200 })).toBe(false)
    expect(isDitherSpec({ ...spec, privateMomentText: 'private' })).toBe(false)
    expect(isDitherSpec({ ...spec, musicFeatures: { ...spec.musicFeatures, privateMomentText: 'private' } })).toBe(false)
  })
})

describe('appearance input validation', () => {
  test.each([{ speed: Infinity }, { speed: -1 }, { size: 4 }, { pixelSize: 1 }, { blue: 0, violet: 0, pink: 0 }, { motif: 'script' }, { source: 'unknown' }, ['flow'], null])('rejects invalid overrides %j', (value) => {
    expect(validateDitherOverrides(value).ok).toBe(false)
  })
  test('accepts both numeric boundaries and known texture choices', () => {
    expect(validateDitherOverrides({ speed: 0, size: .6, pixelSize: 12, motif: 'flower', pointer: 'off' })).toEqual({ ok: true, value: { speed: 0, size: .6, pixelSize: 12, motif: 'flower', pointer: 'off' } })
  })
  test('features require explicit provenance and reject nonfinite or implausible values', () => {
    expect(validateMusicVisualFeatures({ source: 'curated', tempoBpm: 180, energy: .8 })).toEqual({ ok: true, value: { source: 'curated', tempoBpm: 180, energy: .8 } })
    expect(validateMusicVisualFeatures({ tempoBpm: 90 }).ok).toBe(false)
    expect(validateMusicVisualFeatures({ source: 'curated', tempoBpm: 500 }).ok).toBe(false)
    expect(validateMusicVisualFeatures({ source: 'curated', energy: NaN }).ok).toBe(false)
  })
  test('JSON prototype keys are rejected safely rather than crashing validation', () => {
    expect(validateDitherOverrides(JSON.parse('{"__proto__":1}')).ok).toBe(false)
    expect(validateDitherOverrides(JSON.parse('{"constructor":1}')).ok).toBe(false)
  })
})
