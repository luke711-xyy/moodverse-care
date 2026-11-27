import type { PublicMusicPlanet } from '../../music-api'
import { resolveDitherSpec } from '../dither/appearance'
import { buildDitherStageFrame, type StageFrame, type StageLayoutInput } from '../dither/stage-layout'
import type { ExteriorDestination } from './state'

export function cockpitFlightBlend(progress: number) {
  const p = Math.max(0, Math.min(1, (progress - .3) / .4))
  return p * p * (3 - 2 * p)
}

/** Each endpoint is drawn in its own observation layer throughout the trip. */
export function buildCockpitFlightSceneFrame(input: StageLayoutInput, destination: ExteriorDestination, visitor: PublicMusicPlanet | null): StageFrame {
  const rotation = destination === 'galaxy' ? input.galaxyRotation ?? input.rotation : input.homeRotation ?? input.rotation
  return buildDitherStageFrame({ ...input, home: destination === 'galaxy' ? 0 : 1, rotation,
    visitor: destination === 'visitor' && visitor ? resolveDitherSpec(visitor.id, visitor.tracks, visitor.visual) : undefined,
    visitorFriends: destination === 'visitor' ? visitor?.friendSatellites ?? [] : [],
    music: destination === 'visitor' ? visitor?.tracks ?? [] : input.music })
}

/** Original material on an untransformed viewport keeps radius and pixel grid
 * identical regardless of either endpoint's observation camera. */
export function buildCockpitFlightNebulaFrame(input: StageLayoutInput, progress: number): StageFrame {
  const p = Math.max(0, Math.min(1, progress)), opacity = Math.sin(p * Math.PI) * .92
  const cloud = buildDitherStageFrame({ ...input, home:.5, visitor:undefined, systems:[], friends:[], music:[] }).assets.find(a => a.id === 'nebula')!
  return { width:input.width, height:input.height, phase:input.phase, assets:opacity > .001 ? [{...cloud,opacity}] : [], orbits:[], systemTargets:[], ambience:0 }
}
