import type { MusicTrackSummary, MusicVisualFeatures } from '../../music-domain'
import { validateMusicFeatures } from './features.mjs'

export const DITHER_PALETTE = { black: '#08080D', white: '#F2EFF8', blue: '#6C9DFF', violet: '#8E6BFF', pink: '#F279C5' } as const
export const DITHER_FORMS = ['organic', 'particles', 'pulse', 'annulus'] as const
export const DITHER_MOTIFS = ['flow', 'score', 'flower', 'tide', 'digital', 'dust', 'prism'] as const
export const DITHER_ALGORITHMS = ['bayer8', 'bayer4', 'cluster', 'noise'] as const
export const DITHER_FORM_LABELS = { organic: '有机流体', particles: '粒子球', pulse: '脉冲星', annulus: '暗核环流' } as const
export const DITHER_MOTIF_LABELS = { flow: '星空流线', score: '琴谱', flower: '彼岸花', tide: '潮汐', digital: '数字织纹', dust: '星尘', prism: '棱镜环带' } as const
export const DITHER_LIMITS = {
  size: [.6, 1.4], textureScale: [0, 1], disturbance: [0, 1], density: [0, 1], pixelSize: [2, 12],
  exposure: [.3, 1.6], contrast: [.5, 2.6], gamma: [.5, 2.4], blue: [0, 1], violet: [0, 1], pink: [0, 1],
  glow: [0, 1], speed: [0, 1.5], pulse: [0, 1], seedOffset: [0, 65535],
} as const
export type DitherNumericKey = keyof typeof DITHER_LIMITS
export type DitherParameters = Record<DitherNumericKey, number> & {
  form: typeof DITHER_FORMS[number]
  motif: typeof DITHER_MOTIFS[number]
  algorithm: typeof DITHER_ALGORITHMS[number]
  pointer: 'off' | 'weak' | 'strong'
}
export type DitherOverrides = Partial<DitherParameters>
export type DitherPlanetSpec = {
  schemaVersion: 3
  engineVersion: 1
  mappingVersion: 1
  seed: string
  generated: DitherParameters
  overrides: DitherOverrides
  musicFeatures: { tempoBpm: number | null; energy: number; hardness: number; acousticness: number; source: MusicVisualFeatures['source'] | 'mixed' }
}
type Validation<T> = { ok: true; value: T } | { ok: false }
type Track = MusicTrackSummary & { isPrimary?: boolean }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const round = (value: number) => Math.round(value * 10000) / 10000
const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function stableHash(value: string): number {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619)
  return hash >>> 0
}

export function validateMusicVisualFeatures(value: unknown): Validation<MusicVisualFeatures> {
  return validateMusicFeatures(value)
}

export function validateDitherOverrides(value: unknown): Validation<DitherOverrides> {
  if (!record(value)) return { ok: false }
  for (const [key, item] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(DITHER_LIMITS, key)) {
      const [min, max] = DITHER_LIMITS[key as DitherNumericKey]
      if (!finite(item, min, max) || key === 'seedOffset' && !Number.isInteger(item)) return { ok: false }
    } else if (key === 'form' && DITHER_FORMS.includes(item as DitherParameters['form'])) continue
    else if (key === 'motif' && DITHER_MOTIFS.includes(item as DitherParameters['motif'])) continue
    else if (key === 'algorithm' && DITHER_ALGORITHMS.includes(item as DitherParameters['algorithm'])) continue
    else if (key === 'pointer' && ['off', 'weak', 'strong'].includes(String(item))) continue
    else return { ok: false }
  }
  if (value.blue === 0 && value.violet === 0 && value.pink === 0) return { ok: false }
  return { ok: true, value: { ...value } as DitherOverrides }
}

function profile(track: Track) {
  const tags = [...track.genres, ...track.moodTags].join(' ').toLowerCase()
  let defaults = { energy: .5, hardness: .4, acousticness: .4, tempo: .45, motif: 'flow' as DitherParameters['motif'], form: 'organic' as DitherParameters['form'] }
  if (/metal|rock|punk|金属|摇滚/.test(tags)) defaults = { energy: .85, hardness: .9, acousticness: .1, tempo: .8, motif: 'digital', form: 'pulse' }
  else if (/electronic|edm|techno|电子|舞曲/.test(tags)) defaults = { energy: .8, hardness: .7, acousticness: .05, tempo: .75, motif: 'prism', form: 'pulse' }
  else if (/piano|classical|钢琴|古典/.test(tags)) defaults = { energy: .35, hardness: .15, acousticness: .95, tempo: .3, motif: 'score', form: 'particles' }
  else if (/ambient|chill|氛围|舒缓/.test(tags)) defaults = { energy: .2, hardness: .1, acousticness: .5, tempo: .2, motif: 'tide', form: 'organic' }
  else if (/folk|acoustic|民谣|原声/.test(tags)) defaults = { energy: .4, hardness: .15, acousticness: .9, tempo: .35, motif: 'flower', form: 'organic' }
  else if (/jazz|爵士/.test(tags)) defaults = { energy: .5, hardness: .3, acousticness: .8, tempo: .45, motif: 'score', form: 'annulus' }
  const validation = validateMusicVisualFeatures(track.visualFeatures)
  const features = validation.ok ? validation.value : null
  return {
    ...defaults, energy: features?.energy ?? defaults.energy, hardness: features?.hardness ?? defaults.hardness,
    acousticness: features?.acousticness ?? defaults.acousticness,
    tempo: features?.tempoBpm ? clamp((features.tempoBpm - 60) / 120) : defaults.tempo,
    tempoBpm: features?.tempoBpm ?? null, source: features?.source ?? (tags ? 'tag-derived' : 'unknown'),
    calm: /calm|peace|平静|舒缓/.test(tags), hot: /excited|happy|兴奋|热烈/.test(tags),
  }
}

export function effectiveDitherParameters(spec: DitherPlanetSpec): DitherParameters {
  const value = { ...spec.generated, ...spec.overrides }
  const sum = value.blue + value.violet + value.pink
  return { ...value, blue: value.blue / sum, violet: value.violet / sum, pink: value.pink / sum }
}

export function createDitherSpec({ planetId, tracks, previous, overrides }: { planetId: string; tracks: Track[]; previous?: unknown; overrides?: DitherOverrides }): DitherPlanetSpec {
  const profiles = tracks.map(profile)
  const primary = Math.max(0, tracks.findIndex((track) => track.isPrimary))
  const weights = profiles.map((_, index) => profiles.length === 1 ? 1 : index === primary ? .5 : .5 / (profiles.length - 1))
  const weighted = (key: 'energy' | 'hardness' | 'acousticness' | 'tempo') => profiles.length ? round(profiles.reduce((sum, p, i) => sum + p[key] * weights[i], 0)) : .4
  const energy = weighted('energy'), hardness = weighted('hardness'), acousticness = weighted('acousticness'), tempo = weighted('tempo')
  const main = profiles[primary]
  const pink = round(.15 + .55 * hardness + .15 * energy + (main?.hot ? .1 : 0))
  const blue = round(.2 + .4 * (1 - energy) + (main?.calm ? .15 : 0))
  const generated: DitherParameters = {
    form: main?.form ?? DITHER_FORMS[stableHash(planetId) % 4], motif: main?.motif ?? 'flow', algorithm: 'bayer8',
    size: 1, textureScale: round(.3 + hardness * .45), disturbance: round(.1 + .7 * hardness + .15 * energy),
    density: round(.35 + .4 * energy), pixelSize: 3, exposure: 1.2, contrast: round(1.05 + hardness * .6), gamma: 1.05,
    blue, violet: .5, pink, glow: round(.2 + .35 * energy), speed: round(.12 + .65 * tempo + .35 * energy),
    pulse: round(.08 + .35 * energy), pointer: 'weak', seedOffset: 0,
  }
  const chosen = overrides ?? (isDitherSpec(previous) ? previous.overrides : {})
  const validated = validateDitherOverrides(chosen)
  if (!validated.ok) throw new Error('INVALID_APPEARANCE_OVERRIDES')
  const sources = new Set(profiles.map((p) => p.source))
  return {
    schemaVersion: 3, engineVersion: 1, mappingVersion: 1, seed: planetId || 'music-preview', generated, overrides: validated.value,
    musicFeatures: { energy, hardness, acousticness,
      tempoBpm: profiles.length && profiles.every((p) => p.tempoBpm !== null) ? round(profiles.reduce((sum, p, i) => sum + p.tempoBpm! * weights[i], 0)) : null,
      source: sources.size > 1 ? 'mixed' : profiles[0]?.source ?? 'unknown',
    },
  }
}

export function isDitherSpec(value: unknown): value is DitherPlanetSpec {
  if (!record(value) || value.schemaVersion !== 3 || value.engineVersion !== 1 || value.mappingVersion !== 1
    || typeof value.seed !== 'string' || !value.seed || value.seed.length > 200 || !record(value.generated) || !record(value.musicFeatures)) return false
  if (Object.keys(value).some((key) => !['schemaVersion', 'engineVersion', 'mappingVersion', 'seed', 'generated', 'overrides', 'musicFeatures'].includes(key))) return false
  const generated = validateDitherOverrides(value.generated), overrides = validateDitherOverrides(value.overrides)
  if (!generated.ok || !overrides.ok) return false
  const expected = [...Object.keys(DITHER_LIMITS), 'form', 'motif', 'algorithm', 'pointer']
  if (Object.keys(value.generated).length !== expected.length || !expected.every((key) => Object.prototype.hasOwnProperty.call(value.generated, key))) return false
  const f = value.musicFeatures
  if (Object.keys(f).length !== 5 || Object.keys(f).some((key) => !['tempoBpm', 'energy', 'hardness', 'acousticness', 'source'].includes(key))) return false
  if (!finite(f.energy, 0, 1) || !finite(f.hardness, 0, 1) || !finite(f.acousticness, 0, 1)
    || f.tempoBpm !== null && !finite(f.tempoBpm, 30, 300)
    || !['curated', 'demo', 'tag-derived', 'unknown', 'mixed'].includes(String(f.source))) return false
  const p = { ...generated.value, ...overrides.value }
  return (p.blue ?? 0) + (p.violet ?? 0) + (p.pink ?? 0) > 0
}

export function resolveDitherSpec(planetId: string, tracks: Track[], visual: unknown): DitherPlanetSpec {
  if (isDitherSpec(visual) && visual.seed === planetId) return visual
  return createDitherSpec({ planetId, tracks })
}
