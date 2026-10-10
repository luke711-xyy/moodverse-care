import { resolveDitherSpec } from '../dither/appearance'
import { buildDitherStageFrame, type StageFrame, type StageLayoutInput } from '../dither/stage-layout'
import type { CockpitFlight } from './flight'

/** Reuses the exact existing nebula material; no overlay particle approximation. */
export function buildCockpitFlightFrame(input: StageLayoutInput, flight: CockpitFlight): StageFrame {
  const endpoint = (target: 'from' | 'to') => {
    const destination = flight[target]
    const visitor = target === 'from' ? flight.sourceVisitor : flight.targetVisitor
    return buildDitherStageFrame({ ...input, home: destination === 'galaxy' ? 0 : 1,
      visitor: destination === 'visitor' && visitor ? resolveDitherSpec(visitor.id, visitor.tracks, visitor.visual) : undefined,
      visitorFriends: destination === 'visitor' ? visitor?.friendSatellites ?? [] : [],
      music: destination === 'visitor' ? visitor?.tracks ?? [] : input.music })
  }
  const p = Math.max(0, Math.min(1, flight.progress))
  const distance = p < .5 ? 1 - p * 2 : p * 2 - 1
  const scale = .025 + .975 * distance * distance
  const scene = endpoint(p < .5 ? 'from' : 'to')
  const cx = input.width * .5, cy = input.height * .49
  const assets = scene.assets.filter(a => a.id !== 'nebula').map(a => ({ ...a,
    x: cx + (a.x - cx) * scale, y: cy + (a.y - cy) * scale,
    radius: a.radius * scale, opacity: (a.opacity ?? 1) * distance }))
  const cloud = buildDitherStageFrame({ ...input, home: .5, visitor: undefined }).assets.find(a => a.id === 'nebula')!
  const cloudOpacity = Math.sin(p * Math.PI)
  if (cloudOpacity > .001) assets.push({ ...cloud, opacity: cloudOpacity * .92 })
  return { ...scene, assets, orbits: [], systemTargets: [], ambience: scene.ambience }
}
