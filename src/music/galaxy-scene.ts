import type { GalaxyGroup, GalaxyGroupBy } from '../music-api'
import { createDitherSpec, DITHER_PALETTE, resolveAlbumCover, resolveDitherSpec, stableHash, type DitherPlanetSpec } from './dither/appearance'
import { genreArtwork } from './genre-artwork'

export type MusicScenePlanet = { id: string; alias: string; tagline: string; spec: DitherPlanetSpec }
export type MusicGalaxySceneSystem = { id: string; key: string; label: string; color: string; starSpec?: DitherPlanetSpec; planets: MusicScenePlanet[] }
const COLORS = [DITHER_PALETTE.blue, DITHER_PALETTE.violet, DITHER_PALETTE.pink]
export function buildMusicGalaxySceneSystems(by: GalaxyGroupBy, groups: readonly GalaxyGroup[]): MusicGalaxySceneSystem[] {
  return groups.map(group => {
    const id = `${by}:${group.key}`
    const artwork = group.artwork ?? (by === 'genre' ? genreArtwork(group.key) : undefined)
    const coverId = `star:${stableHash(id)}`
    const texture = resolveAlbumCover([{id:coverId,coverUrl:artwork?.url}],coverId)
    const starSpec = createDitherSpec({planetId:id,tracks:[],overrides:{form:'pulse',motif:'flow',size:1,speed:.3,glow:.8,
      ...(texture ? {exposure:1.1,contrast:1.05,gamma:1} : {})}})
    if(texture) { starSpec.coverTexture=texture;starSpec.overrides.coverTrackId=texture.trackId }
    return { id, key: group.key, label: group.label, color: COLORS[stableHash(id) % COLORS.length], starSpec,
      planets: group.planets.slice(0, 16).map(planet => ({ id: planet.planetId, alias: planet.displayName, tagline: planet.tagline,
        spec: resolveDitherSpec(planet.planetId, [], planet.visual) })) }
  })
}
