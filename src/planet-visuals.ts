import { moodById, type MoodId, type PlanetTerrainFeatureCounts, type PlanetVisualPaletteOverride, type ThemeId } from './types'
import type { PlanetClimateState } from './climate'

export type PlanetPalette = {
  ocean: string
  land: string
  vegetation: string
  cloud: string
  atmosphere: string
}

export type PlanetVisualProfile = {
  palette: PlanetPalette
  terrainFeatureConfig?: TerrainFeatureConfig
  landRatio: number
  moisture: number
  vegetationDensity: number
  cloudCoverage: number
  cloudSpeed: number
  rain: number
  lightning: number
  fog: number
  glow: number
  wind: number
  particleDensity: number
}

export type PlanetTextureData = {
  color: Uint8Array
  height: Uint8Array
  landRatio: number
}

const PALETTES: Record<ThemeId, PlanetPalette> = {
  study: { ocean: '#071a38', land: '#315d8f', vegetation: '#3e91a0', cloud: '#d5f2ff', atmosphere: '#70c8ff' },
  career: { ocean: '#291723', land: '#92533c', vegetation: '#b17648', cloud: '#ffe6ca', atmosphere: '#ffb870' },
  court: { ocean: '#28152d', land: '#963f72', vegetation: '#c45987', cloud: '#ffe0ef', atmosphere: '#ff76b6' },
  lens: { ocean: '#092b32', land: '#27766f', vegetation: '#3da881', cloud: '#d9fff2', atmosphere: '#89f4ce' },
  create: { ocean: '#171638', land: '#634f9e', vegetation: '#8a6fb0', cloud: '#eee5ff', atmosphere: '#c39cff' },
  care: { ocean: '#2b2118', land: '#99733b', vegetation: '#9b8c49', cloud: '#fff2c7', atmosphere: '#ffd36b' },
  work_growth: { ocean: '#102d2d', land: '#347a70', vegetation: '#58aa89', cloud: '#d8fff1', atmosphere: '#76dfc8' },
  job_search: { ocean: '#302019', land: '#a36748', vegetation: '#bd8855', cloud: '#ffe5ca', atmosphere: '#f5b477' },
  skill_building: { ocean: '#0a2038', land: '#386e9b', vegetation: '#4b9e9d', cloud: '#e0f4ff', atmosphere: '#69b8ed' },
  intimacy: { ocean: '#2c1929', land: '#984d77', vegetation: '#b76c87', cloud: '#ffe1ef', atmosphere: '#ef89b4' },
  family: { ocean: '#302419', land: '#946747', vegetation: '#a88055', cloud: '#fff0d8', atmosphere: '#e7b887' },
  friendship: { ocean: '#0c2e31', land: '#367e77', vegetation: '#54a98b', cloud: '#ddfff3', atmosphere: '#8ee5d0' },
  wellbeing: { ocean: '#192833', land: '#526f83', vegetation: '#6f9287', cloud: '#e4f1f2', atmosphere: '#8eb5c8' },
  running: { ocean: '#172b20', land: '#527b42', vegetation: '#7dab59', cloud: '#e7f4d4', atmosphere: '#a5dc85' },
  exploration: { ocean: '#0e2635', land: '#347b91', vegetation: '#4a9d87', cloud: '#d9f4f4', atmosphere: '#79cbe1' },
  reading_writing: { ocean: '#241d35', land: '#6b5796', vegetation: '#8e78a4', cloud: '#eee6ff', atmosphere: '#b69ee8' },
  music: { ocean: '#2d1c34', land: '#875477', vegetation: '#a2698a', cloud: '#fae5f5', atmosphere: '#e29cce' },
  fitness: { ocean: '#302418', land: '#8d5b36', vegetation: '#a67c43', cloud: '#fff0cf', atmosphere: '#ffbf69' },
  gaokao: { ocean: '#101e3a', land: '#465f99', vegetation: '#4b8c9c', cloud: '#e0ecff', atmosphere: '#8eb6ff' },
  healthy_eating: { ocean: '#1d2c1e', land: '#617744', vegetation: '#8baa55', cloud: '#eef4d9', atmosphere: '#b4dc89' },
}

type Climate = Omit<PlanetVisualProfile, 'palette' | 'particleDensity'>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function climateForMood(mood: MoodId): Climate {
  const { valence, arousal } = moodById(mood)
  return {
    // Keep the intended planet balance ocean-forward. The generated coast mask
    // below targets a similar share instead of relying on thresholded noise.
    landRatio: .36,
    moisture: clamp01(.52 - valence * .18 + arousal * .07),
    vegetationDensity: clamp01(.53 + valence * .13 - arousal * .035),
    cloudCoverage: clamp01(.39 - valence * .2 + arousal * .16),
    cloudSpeed: clamp01(.08 + arousal * .78),
    rain: clamp01(.025 + Math.max(0, -valence) * .5 + arousal * .025),
    lightning: clamp01(.01 + Math.max(0, arousal - .72) * .3),
    fog: clamp01(.15 + (1 - Math.abs(valence)) * .2 + (1 - arousal) * .08),
    glow: clamp01(.38 + valence * .24 + (1 - arousal) * .13),
    wind: clamp01(.08 + arousal * .78),
  }
}

export function hashString32(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return hash >>> 0
}

export function planetVisualProfile(
  theme: ThemeId,
  mood: MoodId,
  intensity: number,
  visualOverride?: PlanetVisualPaletteOverride,
): PlanetVisualProfile {
  const climate = climateForMood(mood)
  const normalizedIntensity = (Math.min(5, Math.max(1, intensity)) - 1) / 4
  const scale = .68 + normalizedIntensity * .52
  const amplify = (value: number) => clamp01(value * scale)
  const atmosphere = visualOverride?.atmosphere
  const motion = visualOverride?.motion
  const atmosphereProfile = {
    clear: { cloudCoverage: .12, fog: .08, glow: .34 },
    mist: { cloudCoverage: .72, fog: .66, glow: .2 },
    nebula: { cloudCoverage: .48, fog: .78, glow: .58 },
    starlit: { cloudCoverage: .3, fog: .2, glow: .64 },
  } as const
  const motionSpeed = { still: .06, drift: .25, flow: .58, pulse: .9 } as const
  const targetAtmosphere = atmosphere ? atmosphereProfile[atmosphere] : undefined
  const targetMotion = motion ? motionSpeed[motion] : undefined
  const blendClimate = (base: number, target: number, strength: number) => clamp01(base * (1 - strength) + target * strength)
  const aiMotion = targetMotion === undefined ? undefined : blendClimate(amplify(climate.cloudSpeed), targetMotion, .82)
  const aiWind = targetMotion === undefined ? undefined : blendClimate(amplify(climate.wind), targetMotion, .82)

  return {
    palette: visualOverride ? {
      ...(PALETTES[theme] ?? PALETTES.care),
      land: visualOverride.surface,
      ocean: visualOverride.ocean,
      vegetation: visualOverride.accent,
      cloud: visualOverride.accent,
      atmosphere: visualOverride.accent,
    } : PALETTES[theme] ?? PALETTES.care,
    terrainFeatureConfig: terrainFeatureConfigFromCounts(visualOverride?.terrainFeatures),
    landRatio: clamp01(climate.landRatio),
    moisture: amplify(climate.moisture),
    vegetationDensity: amplify(climate.vegetationDensity),
    cloudCoverage: targetAtmosphere
      ? blendClimate(amplify(climate.cloudCoverage), targetAtmosphere.cloudCoverage, .84)
      : amplify(climate.cloudCoverage),
    cloudSpeed: aiMotion ?? amplify(climate.cloudSpeed),
    rain: amplify(climate.rain),
    lightning: amplify(climate.lightning),
    fog: targetAtmosphere ? blendClimate(amplify(climate.fog), targetAtmosphere.fog, .82) : amplify(climate.fog),
    glow: targetAtmosphere ? blendClimate(amplify(climate.glow), targetAtmosphere.glow, .72) : amplify(climate.glow),
    wind: aiWind ?? amplify(climate.wind),
    particleDensity: visualOverride?.particleDensity === undefined ? .5 : clamp01(visualOverride.particleDensity),
  }
}

function randomAt(x: number, y: number, seed: number): number {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77)
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16
  return (value >>> 0) / 0xffff_ffff
}

const smooth = (value: number) => value * value * (3 - 2 * value)
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

function randomAt3(x: number, y: number, z: number, seed: number): number {
  return randomAt(x, y, seed ^ Math.imul(z, 0x27d4eb2d))
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const tz = smooth(z - z0)
  const slice = (zIndex: number) => {
    const top = lerp(randomAt3(x0, y0, zIndex, seed), randomAt3(x0 + 1, y0, zIndex, seed), tx)
    const bottom = lerp(randomAt3(x0, y0 + 1, zIndex, seed), randomAt3(x0 + 1, y0 + 1, zIndex, seed), tx)
    return lerp(top, bottom, ty)
  }
  return lerp(slice(z0), slice(z0 + 1), tz)
}

function terrainNoise3(x: number, y: number, z: number, seed: number): number {
  let total = 0
  let amplitude = .55
  let frequency = 1
  let weight = 0
  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise3(x * frequency, y * frequency, z * frequency, seed + octave * 0x1f123bb5) * amplitude
    weight += amplitude
    frequency *= 2
    amplitude *= .5
  }
  return total / weight
}

export type TerrainFeatureKind = 'mountain_range' | 'basin' | 'canyon' | 'escarpment'

export type TerrainFeature = {
  id: string
  kind: TerrainFeatureKind
  longitude: number
  latitude: number
  bearing: number
  /** Angular half-length / radius in radians. */
  size: number
  /** Angular half-width in radians for linear features. */
  width: number
  /** Normalized elevation change. Positive for relief, negative for depressions. */
  height: number
  ruggedness: number
}

type TerrainFeatureRule = {
  count: [number, number]
  size: [number, number]
  width: [number, number]
  height: [number, number]
  ruggedness: [number, number]
}

export type TerrainFeatureConfig = Partial<Record<TerrainFeatureKind, Partial<TerrainFeatureRule>>>

const featureCountLimits: Record<keyof PlanetTerrainFeatureCounts, number> = {
  mountainRanges: 6,
  basins: 4,
  canyons: 5,
  escarpments: 4,
}

export function terrainFeatureConfigFromCounts(counts?: PlanetTerrainFeatureCounts): TerrainFeatureConfig | undefined {
  if (!counts) return undefined
  const bounded = (key: keyof PlanetTerrainFeatureCounts) => {
    const value = counts[key]
    return Number.isFinite(value) ? Math.min(featureCountLimits[key], Math.max(0, Math.round(value))) : 0
  }
  const exactCount = (count: number) => ({ count: [count, count] as [number, number] })
  return {
    mountain_range: exactCount(bounded('mountainRanges')),
    basin: exactCount(bounded('basins')),
    canyon: exactCount(bounded('canyons')),
    escarpment: exactCount(bounded('escarpments')),
  }
}

export const DEFAULT_TERRAIN_FEATURE_CONFIG: Record<TerrainFeatureKind, TerrainFeatureRule> = {
  mountain_range: { count: [2, 5], size: [.16, .38], width: [.045, .12], height: [.16, .28], ruggedness: [.55, 1] },
  basin: { count: [1, 2], size: [.16, .32], width: [.05, .12], height: [.09, .18], ruggedness: [.3, .9] },
  canyon: { count: [1, 3], size: [.22, .46], width: [.014, .032], height: [.055, .12], ruggedness: [.52, 1] },
  escarpment: { count: [1, 2], size: [.18, .38], width: [.012, .03], height: [.075, .15], ruggedness: [.38, .96] },
}

const TERRAIN_FEATURE_KINDS: TerrainFeatureKind[] = ['mountain_range', 'basin', 'canyon', 'escarpment']
const TERRAIN_FIELD_WIDTH = 192
const TERRAIN_FIELD_HEIGHT = 96
const TERRAIN_FIELD_CACHE_LIMIT = 12
const TERRAIN_FEATURE_CACHE_LIMIT = 64
const LAND_RELIEF_SCALE = .24
const featureCache = new Map<string, TerrainFeature[]>()

type PlanetContinent = {
  x: number; y: number; z: number
  eastX: number; eastZ: number
  northX: number; northY: number; northZ: number
  radius: number; phase: number; phase2: number; phase3: number
  harmonic1: number; harmonic2: number; harmonic3: number; roughness: number
}
const CONTINENT_CANDIDATE_COUNT = 64
const continentCache = new Map<number, PlanetContinent[]>()

function cacheSet<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) cache.delete(cache.keys().next().value as K)
}

const randomRange = (range: [number, number], amount: number) => range[0] + (range[1] - range[0]) * amount

export function createPlanetTerrainFeatures(seed: number, config: TerrainFeatureConfig = {}): TerrainFeature[] {
  const normalizedSeed = seed >>> 0
  const cacheKey = `${normalizedSeed}:${JSON.stringify(config)}`
  const cached = featureCache.get(cacheKey)
  if (cached) return cached.map((feature) => ({ ...feature }))

  const features: TerrainFeature[] = []
  let serial = 0
  TERRAIN_FEATURE_KINDS.forEach((kind, kindIndex) => {
    const rule = { ...DEFAULT_TERRAIN_FEATURE_CONFIG[kind], ...config[kind] }
    const range = (channel: number) => randomAt(serial, channel + kindIndex * 23, normalizedSeed ^ 0x6d2b79f5)
    const count = Math.round(randomRange(rule.count, range(0)))
    for (let index = 0; index < count; index += 1) {
      const slot = serial++
      const value = (channel: number) => randomAt(slot, channel + kindIndex * 23, normalizedSeed ^ 0x6d2b79f5)
      let longitude = value(1)
      let latitude = .13 + value(2) * .74
      if (kind === 'mountain_range' || kind === 'basin') {
        const shore = planetSeaLine(normalizedSeed)
        for (let attempt = 0; attempt < 14; attempt += 1) {
          longitude = randomAt(slot + attempt, 1 + kindIndex, normalizedSeed ^ 0x68bc21eb)
          latitude = .12 + randomAt(slot + attempt, 2 + kindIndex, normalizedSeed ^ 0x02e5be93) * .76
          if (sampleBaseElevation(normalizedSeed, longitude, latitude, []) > shore + .035) break
        }
      }
      features.push({
        id: `${kind}-${index}`,
        kind,
        longitude,
        latitude,
        bearing: value(3) * Math.PI * 2,
        size: randomRange(rule.size, value(4)),
        width: randomRange(rule.width, value(5)),
        height: randomRange(rule.height, value(6)),
        ruggedness: randomRange(rule.ruggedness, value(7)),
      })
    }
  })
  cacheSet(featureCache, cacheKey, features, TERRAIN_FEATURE_CACHE_LIMIT)
  return features.map((feature) => ({ ...feature }))
}

/**
 * Build a seed-specific plate map. Landmass count, spacing, scale and coast
 * harmonics all vary independently; unlike the old farthest-point layout, the
 * centers are not forced into a near-regular arrangement.
 */
function createPlanetContinents(seed: number): PlanetContinent[] {
  const normalizedSeed = seed >>> 0
  const cached = continentCache.get(normalizedSeed)
  if (cached) return cached

  const candidates = Array.from({ length: CONTINENT_CANDIDATE_COUNT }, (_, index) => {
    const vertical = randomAt(index, 0, normalizedSeed ^ 0x2c1b3c6d) * 2 - 1
    const longitude = randomAt(index, 1, normalizedSeed ^ 0x297a2d39) * Math.PI * 2
    const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical))
    return { x: ring * Math.cos(longitude), y: vertical, z: ring * Math.sin(longitude) }
  })

  const count = 2 + Math.floor(randomAt(0, 7, normalizedSeed ^ 0x165667b1) * 7)
  const areaScale = Math.pow(5 / count, .25) * (count > 5 ? .88 : 1)
  const order = candidates.map((_, index) => index).sort((left, right) =>
    randomAt(left, 5, normalizedSeed ^ 0x297a2d39) - randomAt(right, 5, normalizedSeed ^ 0x297a2d39),
  )
  const selected: number[] = []
  for (const index of order) {
    const candidate = candidates[index]
    const spaced = selected.every((selectedIndex) => {
      const center = candidates[selectedIndex]
      return candidate.x * center.x + candidate.y * center.y + candidate.z * center.z < .82
    })
    if (spaced) selected.push(index)
    if (selected.length === count) break
  }
  for (const index of order) {
    if (selected.length === count) break
    if (!selected.includes(index)) selected.push(index)
  }

  const continents = selected.map((candidateIndex, index) => {
    const center = candidates[candidateIndex]
    const centerLongitude = Math.atan2(center.z, center.x)
    const centerLatitude = Math.asin(center.y)
    const sizeRoll = randomAt(index, 3, normalizedSeed ^ 0x7f4a7c15)
    const baseRadius = index === 0
      ? .58 + sizeRoll * .18
      : index === 1
        ? .5 + sizeRoll * .16
        : .27 + sizeRoll * .24
    const radius = Math.min(index === 0 ? .86 : index === 1 ? .78 : .62, baseRadius * areaScale)
    return {
      ...center,
      eastX: -Math.sin(centerLongitude),
      eastZ: Math.cos(centerLongitude),
      northX: -Math.sin(centerLatitude) * Math.cos(centerLongitude),
      northY: Math.cos(centerLatitude),
      northZ: -Math.sin(centerLatitude) * Math.sin(centerLongitude),
      radius,
      phase: randomAt(index, 4, normalizedSeed ^ 0x94d049bb) * Math.PI * 2,
      phase2: randomAt(index, 6, normalizedSeed ^ 0x4cf5ad43) * Math.PI * 2,
      phase3: randomAt(index, 8, normalizedSeed ^ 0x52dce729) * Math.PI * 2,
      harmonic1: 2 + Math.floor(randomAt(index, 9, normalizedSeed ^ 0x7f4a7c15) * 2),
      harmonic2: 3 + Math.floor(randomAt(index, 10, normalizedSeed ^ 0x94d049bb) * 3),
      harmonic3: 5 + Math.floor(randomAt(index, 11, normalizedSeed ^ 0x4cf5ad43) * 4),
      roughness: .65 + randomAt(index, 12, normalizedSeed ^ 0x52dce729) * 1.25,
    }
  })

  cacheSet(continentCache, normalizedSeed, continents, TERRAIN_FEATURE_CACHE_LIMIT)
  return continents
}

function wrapUnit(value: number) {
  return value - Math.round(value)
}

function featureCoordinates(feature: TerrainFeature, longitude: number, latitude: number) {
  const centerLatitude = (feature.latitude - .5) * Math.PI
  const dx = wrapUnit(longitude - feature.longitude) * Math.PI * 2 * Math.max(.12, Math.cos(centerLatitude))
  const dy = (latitude - feature.latitude) * Math.PI
  const along = dx * Math.cos(feature.bearing) + dy * Math.sin(feature.bearing)
  const across = -dx * Math.sin(feature.bearing) + dy * Math.cos(feature.bearing)
  return { along, across, distance: Math.hypot(along, across) }
}

function terrainFeatureElevation(feature: TerrainFeature, longitude: number, latitude: number) {
  const { along, across, distance } = featureCoordinates(feature, longitude, latitude)
  const lengthProgress = Math.abs(along) / Math.max(.001, feature.size)
  if (feature.kind === 'mountain_range') {
    const length = Math.exp(-Math.pow(lengthProgress, 4) * 1.4)
    const acrossProgress = across / Math.max(.001, feature.width)
    const crossSection = Math.exp(-acrossProgress * acrossProgress * 1.45)
    const peaks = .62 + .38 * Math.abs(Math.sin(along / Math.max(.01, feature.size) * (5 + feature.ruggedness * 5) + feature.bearing))
    return feature.height * length * crossSection * peaks
  }
  if (feature.kind === 'basin') {
    const radial = distance / Math.max(.001, feature.size)
    const bowl = -feature.height * Math.exp(-radial * radial * 2.7)
    const rim = feature.height * .36 * Math.exp(-Math.pow((radial - .9) / (.09 + feature.ruggedness * .035), 2))
    return bowl + rim
  }
  const alongFalloff = 1 - smooth(Math.min(1, lengthProgress))
  if (feature.kind === 'canyon') {
    const acrossProgress = Math.abs(across) / Math.max(.001, feature.width)
    const channel = Math.exp(-acrossProgress * acrossProgress * 1.7)
    const bank = Math.exp(-Math.pow((acrossProgress - 2.5) / .8, 2))
    return feature.height * alongFalloff * (-.82 * channel + .3 * bank)
  }
  const step = Math.tanh(across / Math.max(.001, feature.width))
  return feature.height * .5 * step * alongFalloff
}

function sampleBaseElevation(seed: number, longitude: number, latitude: number, features: TerrainFeature[]) {
  const normalizedSeed = seed >>> 0
  // 3D sphere-space noise wraps cleanly across the longitude seam and avoids polar stretching.
  const longitudeAngle = longitude * Math.PI * 2
  const latitudeAngle = (latitude - .5) * Math.PI
  const latitudeRadius = Math.cos(latitudeAngle)
  const sphereX = latitudeRadius * Math.cos(longitudeAngle)
  const sphereY = Math.sin(latitudeAngle)
  const sphereZ = latitudeRadius * Math.sin(longitudeAngle)

  const warpX = (valueNoise3(sphereX * 1.7 + 4, sphereY * 1.7 - 7, sphereZ * 1.7 + 13, normalizedSeed ^ 0x68bc21eb) - .5) * .72
  const warpY = (valueNoise3(sphereX * 1.7 - 9, sphereY * 1.7 + 5, sphereZ * 1.7 + 2, normalizedSeed ^ 0x02e5be93) - .5) * .72
  const warpZ = (valueNoise3(sphereX * 1.7 + 6, sphereY * 1.7 + 11, sphereZ * 1.7 - 3, normalizedSeed ^ 0x967a889b) - .5) * .72
  const broad = terrainNoise3(sphereX * 5.2 + warpX, sphereY * 5.2 + warpY, sphereZ * 5.2 + warpZ, normalizedSeed)
  const detail = terrainNoise3(sphereX * 14.4 + warpX * .45, sphereY * 14.4 + warpY * .45, sphereZ * 14.4 + warpZ * .45, normalizedSeed ^ 0xa511e9b3)
  const ridges = 1 - Math.abs(terrainNoise3(sphereX * 25 + warpX, sphereY * 25 + warpY, sphereZ * 25 + warpZ, normalizedSeed ^ 0x519e71b3) - .5) * 2
  // Reuse the terrain noise fields for coast distortion so the new explicit
  // continent layout adds almost no extra sampling cost.
  const coastWarp = (broad - .5) * .17 + (detail - .5) * .055
  const continents = createPlanetContinents(normalizedSeed)
  let continentDepth = Number.NEGATIVE_INFINITY
  for (const continent of continents) {
    const dot = Math.max(-1, Math.min(1, sphereX * continent.x + sphereY * continent.y + sphereZ * continent.z))
    const distance = Math.acos(dot)
    const bearing = Math.atan2(sphereX * continent.eastX + sphereZ * continent.eastZ, sphereX * continent.northX + sphereY * continent.northY + sphereZ * continent.northZ)
    const broadShape = 1 + continent.roughness * (
      .12 * Math.cos(continent.harmonic1 * bearing + continent.phase)
      + .078 * Math.sin(continent.harmonic2 * bearing + continent.phase2)
      + .052 * Math.cos(continent.harmonic3 * bearing - continent.phase3)
      + .028 * Math.sin(7 * bearing + continent.phase * 1.7)
    )
    continentDepth = Math.max(continentDepth, continent.radius * broadShape + coastWarp - distance)
  }
  // Continent distance determines land vs. ocean. Noise now perturbs the coast
  // gently and shapes terrain within each mass instead of deciding where land
  // exists everywhere on the globe.
  const landInfluence = smooth(clamp01((continentDepth + .025) / .15))
  let elevation = .5 + continentDepth * .48
  elevation += (broad - .5) * (.025 + landInfluence * .095)
  elevation += (detail - .5) * (.008 + landInfluence * .035)
  elevation += (ridges - .5) * landInfluence * .035
  const featureInfluence = .08 + landInfluence * .92
  for (const feature of features) elevation += terrainFeatureElevation(feature, longitude, latitude) * featureInfluence
  return clamp01(Math.min(.96, Math.max(.04, elevation)))
}

export function planetSeaLine(seed: number, seaLevel = 0): number {
  return .5 + (randomAt(0, 0, seed >>> 0) - .5) * .08 + clamp01(seaLevel) * .54
}

export type PlanetRiver = { width: number; depth: number; points: Array<{ longitude: number; latitude: number }> }
export type PlanetLake = { longitude: number; latitude: number; radius: number; phase: number }

type PlanetTerrainField = { elevations: Float32Array; riverDepth: Float32Array; rivers: PlanetRiver[]; lakes: PlanetLake[]; seaLine: number }
const terrainFieldCache = new Map<string, PlanetTerrainField>()

function createPlanetLakes(seed: number, features: TerrainFeature[], seaLine: number): PlanetLake[] {
  const basins = features.filter((feature) => feature.kind === 'basin')
  return basins.map((basin, index) => {
    const dryTerrain = features.filter((feature) => feature.id !== basin.id)
    let longitude = basin.longitude
    let latitude = basin.latitude
    const isDryLand = (lon: number, lat: number) => sampleBaseElevation(seed, lon, lat, dryTerrain) > seaLine + .035
    if (!isDryLand(longitude, latitude)) {
      search: for (const distance of [.045, .085, .13, .18]) {
        for (let spoke = 0; spoke < 20; spoke += 1) {
          const angle = (spoke / 20) * Math.PI * 2 + basin.bearing
          const nextLatitude = clamp01(latitude + Math.sin(angle) * distance / Math.PI)
          const latitudeScale = Math.max(.12, Math.cos((latitude - .5) * Math.PI))
          const nextLongitude = (longitude + Math.cos(angle) * distance / (Math.PI * 2 * latitudeScale) + 1) % 1
          if (isDryLand(nextLongitude, nextLatitude)) {
            longitude = nextLongitude
            latitude = nextLatitude
            break search
          }
        }
      }
    }
    const scale = .14 + randomAt(index, 23, seed ^ 0x73b91c2d) * .08
    return {
      longitude,
      latitude,
      radius: Math.max(.13, Math.min(.22, basin.size * .82 + scale * .12)),
      phase: basin.bearing + randomAt(index, 24, seed ^ 0x68bc21eb) * Math.PI * 2,
    }
  })
}

function carveInlandLakes(elevations: Float32Array, lakes: PlanetLake[], seaLine: number) {
  if (!lakes.length) return
  for (let y = 0; y < TERRAIN_FIELD_HEIGHT; y += 1) {
    const latitude = (y + .5) / TERRAIN_FIELD_HEIGHT
    for (let x = 0; x < TERRAIN_FIELD_WIDTH; x += 1) {
      const longitude = (x + .5) / TERRAIN_FIELD_WIDTH
      const cell = y * TERRAIN_FIELD_WIDTH + x
      for (const lake of lakes) {
        const dx = wrapUnit(longitude - lake.longitude) * Math.PI * 2 * Math.max(.12, Math.cos((lake.latitude - .5) * Math.PI))
        const dy = (latitude - lake.latitude) * Math.PI
        const distance = Math.hypot(dx, dy)
        const angle = Math.atan2(dy, dx)
        const irregularEdge = lake.radius * (1 + .16 * Math.sin(angle * 2 + lake.phase) + .085 * Math.cos(angle * 3 - lake.phase * .7))
        if (distance < irregularEdge) elevations[cell] = Math.min(elevations[cell], seaLine - .004)
      }
    }
  }
}

function rasterRiverDepth(rivers: PlanetRiver[]) {
  const carve = new Float32Array(TERRAIN_FIELD_WIDTH * TERRAIN_FIELD_HEIGHT)
  if (!rivers.length) return carve
  // Rasterize only the narrow strip around each river segment. Scanning every river
  // segment for every globe texel made first-time planet construction unnecessarily
  // expensive, especially while loading a galaxy full of uncached planets.
  for (const river of rivers) {
    const outerWidth = river.width * 2.8
    const outerWidthSq = outerWidth * outerWidth
    const innerWidth = river.width * .42
    for (let index = 1; index < river.points.length; index += 1) {
      const start = river.points[index - 1]
      const end = river.points[index]
      let endLongitude = end.longitude
      if (Math.abs(start.longitude - endLongitude) > .5) endLongitude += start.longitude < .5 ? 1 : -1
      const midLatitude = (start.latitude + end.latitude) * .5
      const cosLatitude = Math.max(.12, Math.cos((midLatitude - .5) * Math.PI))
      const startX = start.longitude * TERRAIN_FIELD_WIDTH
      const endX = endLongitude * TERRAIN_FIELD_WIDTH
      const startY = start.latitude * TERRAIN_FIELD_HEIGHT
      const endY = end.latitude * TERRAIN_FIELD_HEIGHT
      const xRadius = Math.ceil(outerWidth / (Math.PI * 2 * cosLatitude) * TERRAIN_FIELD_WIDTH + 1)
      const yRadius = Math.ceil(outerWidth / Math.PI * TERRAIN_FIELD_HEIGHT + 1)
      const minX = Math.floor(Math.min(startX, endX)) - xRadius
      const maxX = Math.ceil(Math.max(startX, endX)) + xRadius
      const minY = Math.max(0, Math.floor(Math.min(startY, endY)) - yRadius)
      const maxY = Math.min(TERRAIN_FIELD_HEIGHT - 1, Math.ceil(Math.max(startY, endY)) + yRadius)
      const segmentY = (end.latitude - start.latitude) * Math.PI
      for (let y = minY; y <= maxY; y += 1) {
        const latitude = (y + .5) / TERRAIN_FIELD_HEIGHT
        const rowCos = Math.max(.12, Math.cos((latitude - .5) * Math.PI))
        for (let unwrappedX = minX; unwrappedX <= maxX; unwrappedX += 1) {
          const x = (unwrappedX % TERRAIN_FIELD_WIDTH + TERRAIN_FIELD_WIDTH) % TERRAIN_FIELD_WIDTH
          const longitude = (unwrappedX + .5) / TERRAIN_FIELD_WIDTH
          const startDx = (longitude - start.longitude) * Math.PI * 2 * rowCos
          const startDy = (latitude - start.latitude) * Math.PI
          const dx = (endLongitude - start.longitude) * Math.PI * 2 * rowCos
          const dy = segmentY
          const rowLengthSq = dx * dx + dy * dy
          const amount = rowLengthSq > 1e-10 ? clamp01(-(startDx * dx + startDy * dy) / rowLengthSq) : 0
          const nearestX = startDx + dx * amount
          const nearestY = startDy + dy * amount
          const distanceSq = nearestX * nearestX + nearestY * nearestY
          if (distanceSq > outerWidthSq) continue
          const distance = Math.sqrt(distanceSq)
          const influence = 1 - smooth(clamp01((distance - innerWidth) / Math.max(.001, outerWidth - innerWidth)))
          const cell = y * TERRAIN_FIELD_WIDTH + x
          carve[cell] = Math.max(carve[cell], river.depth * influence)
        }
      }
    }
  }
  return carve
}

function tracePlanetRivers(seed: number, seaLine: number, baseElevations: Float32Array): PlanetRiver[] {
  const width = TERRAIN_FIELD_WIDTH
  const height = TERRAIN_FIELD_HEIGHT
  const count = width * height
  const visited = new Uint8Array(count)
  const downstream = new Int32Array(count)
  downstream.fill(-1)
  const filled = new Float32Array(count)
  const heapItems = new Int32Array(count)
  const heapValues = new Float32Array(count)
  let heapSize = 0
  const push = (item: number, value: number) => {
    let index = heapSize++
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (heapValues[parent] <= value) break
      heapItems[index] = heapItems[parent]
      heapValues[index] = heapValues[parent]
      index = parent
    }
    heapItems[index] = item
    heapValues[index] = value
  }
  const pop = () => {
    const item = heapItems[0]
    const lastItem = heapItems[--heapSize]
    const lastValue = heapValues[heapSize]
    let index = 0
    while (index * 2 + 1 < heapSize) {
      let child = index * 2 + 1
      if (child + 1 < heapSize && heapValues[child + 1] < heapValues[child]) child += 1
      if (heapValues[child] >= lastValue) break
      heapItems[index] = heapItems[child]
      heapValues[index] = heapValues[child]
      index = child
    }
    if (heapSize > 0) {
      heapItems[index] = lastItem
      heapValues[index] = lastValue
    }
    return item
  }

  let oceanCount = 0
  for (let index = 0; index < count; index += 1) {
    if (baseElevations[index] >= seaLine) continue
    visited[index] = 1
    filled[index] = baseElevations[index]
    push(index, baseElevations[index])
    oceanCount += 1
  }
  if (!oceanCount) return []

  while (heapSize) {
    const current = pop()
    const x = current % width
    const y = Math.floor(current / width)
    for (let dy = -1; dy <= 1; dy += 1) {
      const nextY = y + dy
      if (nextY < 0 || nextY >= height) continue
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue
        const nextX = (x + dx + width) % width
        const next = nextY * width + nextX
        if (visited[next]) continue
        visited[next] = 1
        downstream[next] = current
        filled[next] = Math.max(baseElevations[next], filled[current] + .000001)
        push(next, filled[next])
      }
    }
  }

  const candidates: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (baseElevations[index] < seaLine + .12) continue
    const x = index % width
    const y = Math.floor(index / width)
    let isRidgeSource = true
    for (let dy = -1; dy <= 1 && isRidgeSource; dy += 1) {
      const nextY = y + dy
      if (nextY < 0 || nextY >= height) continue
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue
        const nextX = (x + dx + width) % width
        if (baseElevations[nextY * width + nextX] > baseElevations[index]) { isRidgeSource = false; break }
      }
    }
    if (isRidgeSource) candidates.push(index)
  }
  candidates.sort((left, right) => baseElevations[right] - baseElevations[left])

  const rivers: PlanetRiver[] = []
  const usedSources: Array<{ longitude: number; latitude: number }> = []
  const usedCells = new Set<number>()
  for (const source of candidates) {
    if (rivers.length >= 5) break
    const x = source % width
    const y = Math.floor(source / width)
    const longitude = (x + .5) / width
    const latitude = (y + .5) / height
    const spaced = usedSources.every((point) => {
      const dx = wrapUnit(point.longitude - longitude) * Math.PI * 2 * Math.cos((latitude - .5) * Math.PI)
      const dy = (point.latitude - latitude) * Math.PI
      return dx * dx + dy * dy > .17 * .17
    })
    if (!spaced) continue

    const route = [source]
    let cursor = source
    let reachedOcean = false
    let hasSteepSpill = false
    while (route.length < 180 && downstream[cursor] >= 0) {
      const next = downstream[cursor]
      if (baseElevations[next] > baseElevations[cursor] + .035) { hasSteepSpill = true; break }
      route.push(next)
      cursor = next
      if (baseElevations[cursor] < seaLine) { reachedOcean = true; break }
    }
    if (!reachedOcean || hasSteepSpill || route.length < 10) continue
    const overlaps = route.filter((index) => usedCells.has(index)).length
    if (overlaps / route.length > .42) continue
    const points = route.map((index) => ({ longitude: ((index % width) + .5) / width, latitude: (Math.floor(index / width) + .5) / height }))
    const variant = randomAt(x, y, seed ^ 0x73b91c2d)
    rivers.push({ points, width: .016 + variant * .012, depth: .028 + variant * .032 })
    points.forEach((_, index) => usedCells.add(route[index]))
    usedSources.push({ longitude, latitude })
  }
  return rivers
}

function buildTerrainField(seed: number, seaLevel: number, featureConfig: TerrainFeatureConfig = {}): PlanetTerrainField {
  const features = createPlanetTerrainFeatures(seed, featureConfig)
  const baseElevations = new Float32Array(TERRAIN_FIELD_WIDTH * TERRAIN_FIELD_HEIGHT)
  for (let y = 0; y < TERRAIN_FIELD_HEIGHT; y += 1) {
    for (let x = 0; x < TERRAIN_FIELD_WIDTH; x += 1) {
      baseElevations[y * TERRAIN_FIELD_WIDTH + x] = sampleBaseElevation(seed, (x + .5) / TERRAIN_FIELD_WIDTH, (y + .5) / TERRAIN_FIELD_HEIGHT, features)
    }
  }
  const seaLine = planetSeaLine(seed, seaLevel)
  const lakes = createPlanetLakes(seed, features, seaLine)
  carveInlandLakes(baseElevations, lakes, seaLine)
  const rivers = tracePlanetRivers(seed, seaLine, baseElevations)
  const riverDepth = rasterRiverDepth(rivers)
  const elevations = baseElevations.slice()
  for (let index = 0; index < elevations.length; index += 1) elevations[index] = clamp01(elevations[index] - riverDepth[index])
  return { elevations, riverDepth, rivers, lakes, seaLine }
}

function getTerrainField(seed: number, seaLevel: number, featureConfig?: TerrainFeatureConfig) {
  const normalizedSeed = seed >>> 0
  const normalizedSeaLevel = clamp01(seaLevel)
  const configKey = featureConfig ? JSON.stringify(featureConfig) : ''
  const key = `${normalizedSeed}:${normalizedSeaLevel.toFixed(4)}:${configKey}`
  const cached = terrainFieldCache.get(key)
  if (cached) {
    terrainFieldCache.delete(key)
    terrainFieldCache.set(key, cached)
    return cached
  }
  const field = buildTerrainField(normalizedSeed, normalizedSeaLevel, featureConfig)
  cacheSet(terrainFieldCache, key, field, TERRAIN_FIELD_CACHE_LIMIT)
  return field
}

function sampleGrid(values: Float32Array, longitude: number, latitude: number) {
  const x = ((longitude % 1 + 1) % 1) * TERRAIN_FIELD_WIDTH - .5
  const y = clamp01(latitude) * TERRAIN_FIELD_HEIGHT - .5
  const xFloor = Math.floor(x)
  const x0 = (xFloor % TERRAIN_FIELD_WIDTH + TERRAIN_FIELD_WIDTH) % TERRAIN_FIELD_WIDTH
  const x1 = (x0 + 1) % TERRAIN_FIELD_WIDTH
  const y0 = Math.max(0, Math.min(TERRAIN_FIELD_HEIGHT - 1, Math.floor(y)))
  const y1 = Math.max(0, Math.min(TERRAIN_FIELD_HEIGHT - 1, y0 + 1))
  const tx = x - xFloor
  const ty = clamp01(y - y0)
  const upper = lerp(values[y0 * TERRAIN_FIELD_WIDTH + x0], values[y0 * TERRAIN_FIELD_WIDTH + x1], tx)
  const lower = lerp(values[y1 * TERRAIN_FIELD_WIDTH + x0], values[y1 * TERRAIN_FIELD_WIDTH + x1], tx)
  return lerp(upper, lower, ty)
}

export function samplePlanetElevation(seed: number, longitude: number, latitude: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): number {
  return sampleGrid(getTerrainField(seed, seaLevel, featureConfig).elevations, longitude, latitude)
}

export function planetRiverDepth(seed: number, longitude: number, latitude: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): number {
  return sampleGrid(getTerrainField(seed, seaLevel, featureConfig).riverDepth, longitude, latitude)
}

export function generatePlanetRivers(seed: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): PlanetRiver[] {
  return getTerrainField(seed, seaLevel, featureConfig).rivers.map((river) => ({ ...river, points: river.points.map((point) => ({ ...point })) }))
}

export function generatePlanetLakes(seed: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): PlanetLake[] {
  return getTerrainField(seed, seaLevel, featureConfig).lakes.map((lake) => ({ ...lake }))
}

export const planetLandReliefScale = LAND_RELIEF_SCALE

export function isPlanetLand(seed: number, longitude: number, latitude: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): boolean {
  return samplePlanetElevation(seed, longitude, latitude, seaLevel, featureConfig) >= planetSeaLine(seed, seaLevel)
}

export type LandFocus = { longitude: number; latitude: number; clearance: number }

export function largestLandFocus(seed: number, seaLevel = 0, featureConfig?: TerrainFeatureConfig): LandFocus {
  const width = 128
  const height = 64
  const total = width * height
  const normalizedSeed = seed >>> 0
  const shoreline = planetSeaLine(normalizedSeed, seaLevel)
  const land = new Uint8Array(total)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const longitude = (x + .5) / width
      const latitude = (y + .5) / height
      land[y * width + x] = samplePlanetElevation(normalizedSeed, longitude, latitude, seaLevel, featureConfig) >= shoreline ? 1 : 0
    }
  }

  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let largest: number[] = []
  for (let start = 0; start < total; start += 1) {
    if (!land[start] || visited[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      const left = y * width + (x + width - 1) % width
      const right = y * width + (x + 1) % width
      const up = y > 0 ? index - width : -1
      const down = y + 1 < height ? index + width : -1
      for (const next of [left, right, up, down]) {
        if (next < 0 || !land[next] || visited[next]) continue
        visited[next] = 1
        queue[tail++] = next
      }
    }
    if (tail > largest.length) largest = Array.from(queue.subarray(0, tail))
  }

  if (!largest.length) return { longitude: .5, latitude: .5, clearance: 0 }

  const mask = new Uint8Array(total)
  const distance = new Int16Array(total)
  distance.fill(-1)
  let centroidSin = 0
  let centroidCos = 0
  let centroidLatitude = 0
  let weightTotal = 0
  for (const index of largest) {
    mask[index] = 1
    const x = index % width
    const y = Math.floor(index / width)
    const longitude = (x + .5) / width
    const latitude = (y + .5) / height
    const areaWeight = Math.max(.001, Math.cos((latitude - .5) * Math.PI))
    centroidSin += Math.sin(longitude * Math.PI * 2) * areaWeight
    centroidCos += Math.cos(longitude * Math.PI * 2) * areaWeight
    centroidLatitude += latitude * areaWeight
    weightTotal += areaWeight
  }
  let centroidLongitude = Math.atan2(centroidSin, centroidCos) / (Math.PI * 2)
  if (centroidLongitude < 0) centroidLongitude += 1
  centroidLatitude /= weightTotal

  let head = 0
  let tail = 0
  for (const index of largest) {
    const x = index % width
    const y = Math.floor(index / width)
    const left = y * width + (x + width - 1) % width
    const right = y * width + (x + 1) % width
    const up = y > 0 ? index - width : -1
    const down = y + 1 < height ? index + width : -1
    if (up < 0 || down < 0 || !mask[left] || !mask[right] || !mask[up] || !mask[down]) {
      distance[index] = 0
      queue[tail++] = index
    }
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    const nextDistance = distance[index] + 1
    const left = y * width + (x + width - 1) % width
    const right = y * width + (x + 1) % width
    const up = y > 0 ? index - width : -1
    const down = y + 1 < height ? index + width : -1
    for (const next of [left, right, up, down]) {
      if (next < 0 || !mask[next] || distance[next] >= 0) continue
      distance[next] = nextDistance
      queue[tail++] = next
    }
  }

  let bestIndex = largest[0]
  let bestClearance = -1
  let bestCentroidDistance = Number.POSITIVE_INFINITY
  for (const index of largest) {
    const x = index % width
    const y = Math.floor(index / width)
    const longitude = (x + .5) / width
    const latitude = (y + .5) / height
    let longitudeDistance = Math.abs(longitude - centroidLongitude)
    longitudeDistance = Math.min(longitudeDistance, 1 - longitudeDistance)
    const centroidDistance = longitudeDistance * Math.cos((latitude - .5) * Math.PI) + Math.abs(latitude - centroidLatitude)
    const clearance = distance[index]
    if (clearance > bestClearance || (clearance === bestClearance && centroidDistance < bestCentroidDistance)) {
      bestIndex = index
      bestClearance = clearance
      bestCentroidDistance = centroidDistance
    }
  }

  return {
    longitude: ((bestIndex % width) + .5) / width,
    latitude: (Math.floor(bestIndex / width) + .5) / height,
    clearance: Math.max(0, bestClearance),
  }
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number): [number, number, number] {
  const mix = clamp01(amount)
  return [
    Math.round(lerp(from[0], to[0], mix)),
    Math.round(lerp(from[1], to[1], mix)),
    Math.round(lerp(from[2], to[2], mix)),
  ]
}

function liftLandColor(color: [number, number, number]): [number, number, number] {
  const luminance = color[0] * .2126 + color[1] * .7152 + color[2] * .0722
  const saturation = 1.2
  const brightness = 1.14
  return color.map((channel) => Math.round(clamp01((luminance + (channel - luminance) * saturation) * brightness / 255) * 255)) as [number, number, number]
}

export function generatePlanetTextureData(
  seed: number,
  profile: PlanetVisualProfile,
  requestedWidth = 256,
  requestedHeight = 128,
  climate?: Pick<PlanetClimateState, 'seaLevel' | 'snow' | 'vegetationHealth'>,
  featureConfig?: TerrainFeatureConfig,
): PlanetTextureData {
  const width = Math.max(2, Math.floor(requestedWidth))
  const height = Math.max(2, Math.floor(requestedHeight))
  const pixels = width * height
  const normalizedSeed = seed >>> 0
  const seaLevel = climate?.seaLevel ?? 0
  const field = getTerrainField(normalizedSeed, seaLevel, featureConfig)
  const elevations = new Float32Array(pixels)

  for (let y = 0; y < height; y += 1) {
    const latitude = (y + .5) / height
    for (let x = 0; x < width; x += 1) {
      const longitude = (x + .5) / width
      elevations[y * width + x] = sampleGrid(field.elevations, longitude, latitude)
    }
  }

  const seaLine = field.seaLine
  let oceanMinimum = Number.POSITIVE_INFINITY
  let oceanMaximum = Number.NEGATIVE_INFINITY
  let landMinimum = Number.POSITIVE_INFINITY
  let landMaximum = Number.NEGATIVE_INFINITY
  for (const elevation of elevations) {
    if (elevation >= seaLine) {
      landMinimum = Math.min(landMinimum, elevation)
      landMaximum = Math.max(landMaximum, elevation)
    } else {
      oceanMinimum = Math.min(oceanMinimum, elevation)
      oceanMaximum = Math.max(oceanMaximum, elevation)
    }
  }
  const color = new Uint8Array(pixels * 4)
  const heightData = new Uint8Array(pixels)
  const oceanDeep = parseHex(profile.palette.ocean)
  const oceanLight = mixColor(oceanDeep, [73, 153, 194], .62)
  const land = parseHex(profile.palette.land)
  const landShadow = mixColor(land, [4, 10, 23], .26)
  const snow = parseHex('#e8f5fa')
  let measuredLandArea = 0
  let totalSurfaceArea = 0

  for (let index = 0; index < pixels; index += 1) {
    const isLand = elevations[index] >= seaLine
    const y = Math.floor(index / width)
    const latitudeWeight = Math.max(.001, Math.cos(((y + .5) / height - .5) * Math.PI))
    totalSurfaceArea += latitudeWeight
    let pixelColor: [number, number, number]
    if (isLand) {
      measuredLandArea += latitudeWeight
      const altitude = clamp01((elevations[index] - landMinimum) / Math.max(.000001, landMaximum - landMinimum))
      heightData[index] = 128 + Math.round(altitude * 127)
      pixelColor = liftLandColor(mixColor(landShadow, land, .7 + altitude * .24))
      const latitude = (y + .5) / height
      const polarFrost = clamp01((Math.abs(latitude - .5) - .19) * 3.2)
      const summitFrost = clamp01((altitude - .62) * 1.8)
      const frostCoverage = clamp01((climate?.snow ?? 0) * Math.max(polarFrost, summitFrost))
      if (frostCoverage > 0) pixelColor = mixColor(pixelColor, snow, frostCoverage)
    } else {
      const depth = clamp01((elevations[index] - oceanMinimum) / Math.max(.000001, oceanMaximum - oceanMinimum))
      heightData[index] = Math.round(18 + depth * 109)
      pixelColor = mixColor(oceanDeep, oceanLight, depth * .42)
    }

    const colorOffset = index * 4
    color[colorOffset] = pixelColor[0]
    color[colorOffset + 1] = pixelColor[1]
    color[colorOffset + 2] = pixelColor[2]
    color[colorOffset + 3] = 255
  }

  // Equirectangular maps have more texels near the poles than those areas occupy
  // on a sphere, so report the latitude-weighted physical surface share.
  return { color, height: heightData, landRatio: measuredLandArea / totalSurfaceArea }
}
