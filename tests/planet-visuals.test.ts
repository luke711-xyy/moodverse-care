import { expect, test } from 'vitest'

import {
  createPlanetTerrainFeatures,
  generatePlanetLakes,
  generatePlanetRivers,
  generatePlanetTextureData,
  hashString32,
  isPlanetLand,
  planetRiverDepth,
  planetSeaLine,
  samplePlanetElevation,
  planetVisualProfile,
} from '../src/planet-visuals.ts'
import { MOOD_IDS } from '../src/types.ts'

const MOODS = MOOD_IDS

const NORMALIZED_FIELDS = [
  'landRatio',
  'moisture',
  'vegetationDensity',
  'cloudCoverage',
  'cloudSpeed',
  'rain',
  'lightning',
  'fog',
  'glow',
  'wind',
] as const

const PALETTE_FIELDS = ['ocean', 'land', 'vegetation', 'cloud', 'atmosphere'] as const

function assertNormalizedProfile(profile: ReturnType<typeof planetVisualProfile>) {
  for (const field of NORMALIZED_FIELDS) {
    const value = profile[field]
    expect(Number.isFinite(value), `${field} should be finite`).toBe(true)
    expect(value, `${field} should stay at or above 0`).toBeGreaterThanOrEqual(0)
    expect(value, `${field} should stay at or below 1`).toBeLessThanOrEqual(1)
  }

  for (const field of PALETTE_FIELDS) {
    expect(profile.palette[field], `${field} should be a six-digit hex colour`).toMatch(/^#[0-9a-f]{6}$/i)
  }
}

test('hashString32 is a deterministic unsigned hash of a planet id', () => {
  const id = '行星·planet-alpha'
  const first = hashString32(id)

  expect(hashString32(id)).toBe(first)
  expect(Number.isInteger(first)).toBe(true)
  expect(first).toBeGreaterThanOrEqual(0)
  expect(first).toBeLessThanOrEqual(0xffff_ffff)
  expect(hashString32('planet-alpha')).not.toBe(hashString32('planet-beta'))
})

test('all mood types produce distinct, normalized climate profiles', () => {
  const profiles = MOODS.map((mood) => planetVisualProfile('study', mood, 3))

  for (const profile of profiles) assertNormalizedProfile(profile)

  const climateSignatures = profiles.map((profile) =>
    NORMALIZED_FIELDS.map((field) => profile[field].toFixed(6)).join('|'),
  )
  expect(new Set(climateSignatures).size).toBe(MOODS.length)
})

test('intensity amplifies every mood climate without overflowing normalized values', () => {
  for (const mood of MOODS) {
    const quiet = planetVisualProfile('care', mood, 1)
    const intense = planetVisualProfile('care', mood, 5)

    assertNormalizedProfile(quiet)
    assertNormalizedProfile(intense)

    const climateChanges = NORMALIZED_FIELDS
      .filter((field) => field !== 'landRatio')
      .map((field) => intense[field] - quiet[field])

    expect(
      climateChanges.some((change) => change > 0),
      `${mood} should amplify at least one climate signal at intensity 5`,
    ).toBe(true)
    expect(intense).not.toEqual(quiet)
  }
})

test('surface data is deterministic for the same planet id and changes for another id', () => {
  const profile = planetVisualProfile('create', 'hope', 4)
  const width = 32
  const height = 16

  const first = generatePlanetTextureData(hashString32('planet-same'), profile, width, height)
  const repeated = generatePlanetTextureData(hashString32('planet-same'), profile, width, height)
  const other = generatePlanetTextureData(hashString32('planet-other'), profile, width, height)

  expect(repeated.color).toEqual(first.color)
  expect(repeated.height).toEqual(first.height)
  expect(repeated.landRatio).toBe(first.landRatio)
  expect(other.height).not.toEqual(first.height)
})

test('surface buffers have the requested dimensions and contain both land and ocean', () => {
  const width = 48
  const height = 24
  const pixels = width * height
  const surface = generatePlanetTextureData(
    hashString32('planet-land-and-ocean'),
    planetVisualProfile('lens', 'calm', 3),
    width,
    height,
  )

  expect(surface.color).toBeInstanceOf(Uint8Array)
  expect(surface.height).toBeInstanceOf(Uint8Array)
  expect(surface.color).toHaveLength(pixels * 4)
  expect(surface.height).toHaveLength(pixels)

  const landPixels = surface.height.reduce((count, value) => count + (value >= 128 ? 1 : 0), 0)
  const oceanPixels = pixels - landPixels
  expect(landPixels, 'height data should contain land at or above sea level').toBeGreaterThan(0)
  expect(oceanPixels, 'height data should contain ocean below sea level').toBeGreaterThan(0)
  expect(surface.landRatio).toBeGreaterThan(0)
  expect(surface.landRatio).toBeLessThan(1)
  const weightedLandArea = surface.height.reduce((area, value, index) => {
    const latitude = (Math.floor(index / width) + .5) / height
    return area + (value >= 128 ? Math.max(.001, Math.cos((latitude - .5) * Math.PI)) : 0)
  }, 0)
  const totalWeightedArea = Array.from({ length: height }, (_, y) =>
    Math.max(.001, Math.cos(((y + .5) / height - .5) * Math.PI)) * width,
  ).reduce((sum, area) => sum + area, 0)
  expect(Math.abs(surface.landRatio - weightedLandArea / totalWeightedArea)).toBeLessThanOrEqual(1 / pixels)
  const oceanIndex = surface.height.findIndex((value) => value < 128)
  const oceanOffset = oceanIndex * 4
  expect(surface.color[oceanOffset + 2], 'ocean should remain visibly blue').toBeGreaterThan(surface.color[oceanOffset] * 3)
  expect(surface.color[oceanOffset + 2]).toBeGreaterThan(surface.color[oceanOffset + 1])

  for (let alpha = 3; alpha < surface.color.length; alpha += 4) {
    expect(surface.color[alpha], 'generated RGBA pixels should be opaque').toBe(255)
  }
})

test('randomized continent layouts keep ocean-forward coverage while varying their silhouettes', () => {
  const width = 96
  const height = 48
  const ratios: number[] = []
  const majorLandmassCounts: number[] = []
  const coastComplexities: number[] = []

  for (let seed = 1; seed <= 20; seed += 1) {
    const surface = generatePlanetTextureData(seed * 7919, planetVisualProfile('study', 'calm', 3), width, height)
    ratios.push(surface.landRatio)

    const land = surface.height.map((elevation) => elevation >= 128)
    const visited = new Uint8Array(width * height)
    const queue = new Int32Array(width * height)
    const sizes: number[] = []
    let coastEdges = 0
    for (let start = 0; start < land.length; start += 1) {
      const edgeX = start % width
      const edgeY = Math.floor(start / width)
      if (land[start] && (
        !land[edgeY * width + (edgeX + width - 1) % width]
        || !land[edgeY * width + (edgeX + 1) % width]
        || edgeY === 0 || !land[start - width]
        || edgeY === height - 1 || !land[start + width]
      )) coastEdges += 1
      if (!land[start] || visited[start]) continue
      let head = 0
      let tail = 0
      queue[tail++] = start
      visited[start] = 1
      while (head < tail) {
        const index = queue[head++]
        const x = index % width
        const y = Math.floor(index / width)
        const neighbours = [
          y * width + (x + width - 1) % width,
          y * width + (x + 1) % width,
          y > 0 ? index - width : -1,
          y + 1 < height ? index + width : -1,
        ]
        for (const next of neighbours) {
          if (next < 0 || !land[next] || visited[next]) continue
          visited[next] = 1
          queue[tail++] = next
        }
      }
      sizes.push(tail)
    }
    majorLandmassCounts.push(sizes.filter((size) => size >= width * height * .008).length)
    coastComplexities.push(coastEdges)
  }

  expect(ratios.every((ratio) => ratio >= .18 && ratio <= .43), `land coverage by seed: ${ratios.join(', ')}`).toBe(true)
  expect(majorLandmassCounts.every((count) => count >= 1 && count <= 8), `major landmasses by seed: ${majorLandmassCounts.join(', ')}`).toBe(true)
  expect(new Set(majorLandmassCounts).size).toBeGreaterThan(1)
  expect(new Set(coastComplexities).size).toBeGreaterThan(12)
  const meanLandRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  expect(meanLandRatio).toBeGreaterThan(.25)
  expect(meanLandRatio).toBeLessThan(.36)
})

test('basin features create visible, deterministic inland water bodies', () => {
  const seed = hashString32('lake-system-test')
  const lakes = generatePlanetLakes(seed)
  expect(lakes.length).toBeGreaterThanOrEqual(1)
  expect(lakes.length).toBeLessThanOrEqual(2)
  expect(generatePlanetLakes(seed)).toEqual(lakes)
  expect(generatePlanetLakes(seed + 1)).not.toEqual(lakes)
  for (const lake of lakes) {
    expect(lake.radius).toBeGreaterThanOrEqual(.13)
    expect(lake.radius).toBeLessThanOrEqual(.22)
    expect(isPlanetLand(seed, lake.longitude, lake.latitude)).toBe(false)
  }
})

test('parametric terrain features are seeded, bounded, and support shape overrides', () => {
  const first = createPlanetTerrainFeatures(421)
  const repeated = createPlanetTerrainFeatures(421)
  const other = createPlanetTerrainFeatures(422)

  expect(repeated).toEqual(first)
  expect(other).not.toEqual(first)
  expect(new Set(first.map((feature) => feature.kind))).toEqual(new Set(['mountain_range', 'basin', 'canyon', 'escarpment']))
  for (const feature of first) {
    expect(feature.size).toBeGreaterThan(0)
    expect(feature.width).toBeGreaterThan(0)
    expect(feature.height).toBeGreaterThan(0)
    expect(feature.ruggedness).toBeGreaterThanOrEqual(0)
    expect(feature.ruggedness).toBeLessThanOrEqual(1)
  }

  const custom = createPlanetTerrainFeatures(421, {
    canyon: { count: [1, 1], size: [.31, .31], width: [.01, .01], height: [.08, .08], ruggedness: [.7, .7] },
  }).filter((feature) => feature.kind === 'canyon')
  expect(custom).toHaveLength(1)
  expect(custom[0].size).toBe(.31)
  expect(custom[0].width).toBe(.01)
  expect(custom[0].height).toBe(.08)

  const customFeatureConfig = {
    mountain_range: { count: [0, 0] }, basin: { count: [0, 0] },
    canyon: { count: [1, 1], size: [.31, .31], width: [.01, .01], height: [.08, .08], ruggedness: [.7, .7] },
    escarpment: { count: [0, 0] },
  } as const
  const noFeatureConfig = {
    mountain_range: { count: [0, 0] }, basin: { count: [0, 0] }, canyon: { count: [0, 0] }, escarpment: { count: [0, 0] },
  } as const
  const customFeature = createPlanetTerrainFeatures(421, customFeatureConfig).find((feature) => feature.kind === 'canyon')!
  expect(samplePlanetElevation(421, customFeature.longitude, customFeature.latitude, 0, customFeatureConfig))
    .not.toBe(samplePlanetElevation(421, customFeature.longitude, customFeature.latitude, 0, noFeatureConfig))
})

test('generated rivers are deterministic and run from elevated land to the ocean through carved channels', () => {
  const seed = hashString32('river-system-test')
  const rivers = generatePlanetRivers(seed)
  expect(rivers.length).toBeGreaterThan(0)
  expect(generatePlanetRivers(seed)).toEqual(rivers)
  expect(generatePlanetRivers(seed + 1)).not.toEqual(rivers)

  const shoreline = planetSeaLine(seed)
  for (const river of rivers) {
    expect(river.points.length).toBeGreaterThanOrEqual(10)
    const source = river.points[0]
    const mouth = river.points.at(-1)!
    expect(samplePlanetElevation(seed, source.longitude, source.latitude)).toBeGreaterThanOrEqual(shoreline)
    expect(isPlanetLand(seed, mouth.longitude, mouth.latitude)).toBe(false)
    const middle = river.points[Math.floor(river.points.length / 2)]
    expect(planetRiverDepth(seed, middle.longitude, middle.latitude)).toBeGreaterThan(0)
  }
})
