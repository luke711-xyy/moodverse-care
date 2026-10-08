import type { GalaxyGroup, GalaxyGroupBy } from '../music-api'
import { DITHER_PALETTE, resolveDitherSpec, stableHash, type DitherPlanetSpec } from './dither/appearance'

export type MusicScenePlanet = { id: string; alias: string; tagline: string; spec: DitherPlanetSpec }
export type MusicGalaxySceneSystem = { id: string; key: string; label: string; color: string; planets: MusicScenePlanet[] }
const COLORS = [DITHER_PALETTE.blue, DITHER_PALETTE.violet, DITHER_PALETTE.pink]
export function buildMusicGalaxySceneSystems(by: GalaxyGroupBy, groups: readonly GalaxyGroup[]): MusicGalaxySceneSystem[] {
  return groups.map(group => {
    const id = `${by}:${group.key}`
    return { id, key: group.key, label: group.label, color: COLORS[stableHash(id) % COLORS.length],
      planets: group.planets.map(planet => ({ id: planet.planetId, alias: planet.displayName, tagline: planet.tagline,
        spec: resolveDitherSpec(planet.planetId, [], planet.visual) })) }
  })
}
