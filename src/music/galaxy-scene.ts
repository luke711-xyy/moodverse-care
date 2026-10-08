import type { GalaxyGroup, GalaxyGroupBy, GalaxyPlanetCard } from '../music-api'
import type { Planet, ThemeId } from '../types'
import { buildGalaxyAnchors, buildPlanetSlots, type GalaxyAnchor } from '../universe'

export type MusicGalaxySceneSystem = {
  id: string
  key: string
  label: string
  color: string
  anchor: GalaxyAnchor
  planets: Planet[]
}

const GALAXY_COLORS = ['#72c9ff', '#ffb56f', '#f27ab9', '#71e2c2', '#b69aff', '#f2d16b', '#7bd3dc', '#ffa48f']

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function visualOverride(value: GalaxyPlanetCard['visual']): Planet['visualOverride'] {
  const visual = value && 'palette' in value ? value : undefined
  if (!visual || !/^#[\da-f]{6}$/i.test(visual.palette.surface)
    || !/^#[\da-f]{6}$/i.test(visual.palette.ocean)
    || !/^#[\da-f]{6}$/i.test(visual.palette.accent)) return undefined
  return {
    surface: visual.palette.surface,
    ocean: visual.palette.ocean,
    accent: visual.palette.accent,
    atmosphere: visual.atmosphere,
    motion: visual.motion,
    particleDensity: visual.particleDensity,
    terrainFeatures: visual.terrainFeatures,
  }
}

export function buildMusicGalaxySceneSystems(
  by: GalaxyGroupBy,
  groups: readonly GalaxyGroup[],
  radius = 22,
): MusicGalaxySceneSystem[] {
  const anchors = buildGalaxyAnchors(groups.map(() => 'music' as ThemeId), radius)
  return groups.map((group, groupIndex) => {
    const id = `${by}:${group.key}`
    const anchor = anchors[groupIndex]
    const positions = buildPlanetSlots(id, group.planets.length, 2.7)
    const planets = group.planets.map((planet, index): Planet => ({
      id: planet.planetId,
      alias: planet.displayName,
      tagline: planet.tagline,
      visualSeed: planet.planetId,
      theme: 'music',
      mood: 'calm',
      intensity: 3,
      message: planet.tagline,
      position: positions[index] ?? [0, 0, 0],
      orbit: index * 0.49,
      owner: false,
      visualOverride: visualOverride(planet.visual),
    }))
    return {
      id,
      key: group.key,
      label: group.label,
      color: GALAXY_COLORS[stableHash(id) % GALAXY_COLORS.length],
      anchor,
      planets,
    }
  })
}
