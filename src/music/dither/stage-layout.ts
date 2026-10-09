import type { MusicGalaxySceneSystem } from '../galaxy-scene'
import { createDitherSpec, type DitherPlanetSpec } from './appearance'
import { depthOrderedAssets, orbitDepth, orbitPoint, satelliteAsset, type DitherOrbitGeometry } from './layout'
import type { DitherAsset, DitherFrame } from './renderer'
import { galaxyTourPosition } from '../galaxy-navigation'

const clamp = (n: number) => Math.max(0, Math.min(1, n))
export function sampleHomeTransition(progress: number) {
  const p = clamp(progress)
  return { homeScale: .025 + .975 * p * p, homeOpacity: p, cloudOpacity: p === 0 || p === 1 ? 0 : Math.sin(p * Math.PI) }
}
export type StageLayoutInput = { width: number; height: number; phase: number; owner: DitherPlanetSpec; visitor?: DitherPlanetSpec; systems: MusicGalaxySceneSystem[]; home: number; journey: number; rotation: number; focusedGalaxy?: string; friends: { id: string }[]; music: { id: string }[] }
export type StageFrame = DitherFrame & { orbits: DitherOrbitGeometry[]; systemTargets: { id: string; x: number; y: number; radius: number }[] }
export function buildDitherStageFrame(input: StageLayoutInput): StageFrame {
  const { width, height, phase, owner, visitor, systems, focusedGalaxy, rotation } = input
  const narrow = width < 760, x = width * (narrow ? .5 : .51), y = height * .49
  const radius = Math.min(width * (narrow ? .29 : .19), height * .31) * 1.5
  const assets: DitherAsset[] = [], orbits: DitherOrbitGeometry[] = [], systemTargets: StageFrame['systemTargets'] = []
  const home = sampleHomeTransition(input.home)
  const { systemIndex } = galaxyTourPosition(input.journey, systems.length)
  for (const [index, system] of systems.entries()) {
    if (input.home >= 1 || visitor || focusedGalaxy && focusedGalaxy !== system.id) continue
    const offset = focusedGalaxy ? 0 : index - systemIndex
    if (Math.abs(offset) > 1.5) continue
    const cx = x + offset * width * .65, cy = y + Math.sin(offset * .9) * height * .16
    const scale = focusedGalaxy ? 1 : .68 / (1 + Math.abs(offset) * .45)
    const r = radius * scale, opacity = 1 - home.homeOpacity
    const star = createDitherSpec({ planetId: system.id, tracks: [], overrides: { form: 'pulse', motif: 'flow', size: 1, speed: .3, glow: .8 } })
    const center: DitherAsset = { id: 'system:' + system.id, spec: star, x: cx, y: cy, radius: r * .35, kind: 'star', opacity, depth: 0 }
    systemTargets.push({ id: system.id, x: cx, y: cy, radius: r * 1.8 })
    const orbit = { x: cx, y: cy, rx: r * 1.5, ry: r * .72, tilt: -.3 }
    orbits.push(orbit)
    const bodies = system.planets.map((planet, i) => {
      const angle = i * Math.PI * 2 / Math.max(1, system.planets.length) + rotation + phase * .18
      return { id: 'planet:' + planet.id, spec: planet.spec, ...orbitPoint(orbit, angle), depth: orbitDepth(orbit, angle), radius: r * (.21 + i % 3 * .018), opacity, rotation: angle * .1 }
    })
    assets.push(...depthOrderedAssets([center, ...bodies]))
  }
  if (input.home > 0 || visitor) {
    const spec = visitor ?? owner, k = visitor ? 1 : home.homeScale, opacity = visitor ? 1 : home.homeOpacity
    const bodies: DitherAsset[] = [{ id: visitor ? 'visitor:' + spec.seed : 'home:' + spec.seed, spec, x, y, radius: radius * k, opacity, rotation: rotation * .25, depth: 0 }]
    const orbit = { x, y, rx: radius * 1.32 * k, ry: radius * .63 * k, tilt: -.33 }
    orbits.push(orbit)
    for (const [i, track] of input.music.entries()) {
      const asset = satelliteAsset(spec, { id: 'music:' + track.id, kind: 'music', orbit, phase: i * Math.PI * 2 / Math.max(1, input.music.length) + phase * .2, radius: radius * .105 * k })
      bodies.push({ ...asset, opacity })
    }
    if (!visitor) for (const [i, friend] of input.friends.entries()) {
      const friendOrbit = { ...orbit, rx: orbit.rx * 1.26, ry: orbit.ry * 1.1 }
      if (!i) orbits.push(friendOrbit)
      bodies.push({ ...satelliteAsset(spec, { id: 'friend:' + friend.id, kind: 'friend', orbit: friendOrbit, phase: i * Math.PI * 2 / Math.max(1, input.friends.length) + phase * .16 + .7, radius: radius * .1 * k }), opacity })
    }
    assets.push(...depthOrderedAssets(bodies))
  }
  if (home.cloudOpacity > .01) {
    const cloud = createDitherSpec({ planetId: 'nebula', tracks: [], overrides: { form: 'organic', motif: 'flow', size: 1, speed: .6, density: .65, pixelSize: 4, disturbance: .9 } })
    assets.push({ id: 'nebula', kind: 'nebula', spec: cloud, x: width * .5, y: height * .5, radius: Math.max(width, height) * .72, opacity: home.cloudOpacity * .92 })
  }
  // Keep the living star/nebula field behind every destination. It is rendered
  // by the same interactive dither pass, not a static backdrop image.
  return { width, height, phase, assets, orbits, systemTargets, ambience: visitor ? .65 : 1 - home.homeOpacity * .35 }
}
