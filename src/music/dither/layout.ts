import { effectiveDitherParameters, type DitherPlanetSpec } from './appearance'
import type { DitherAsset } from './renderer'
import { sampleDitherPixel } from './sampler'

export type DitherOrbitGeometry = { x: number; y: number; rx: number; ry: number; tilt: number }
export function orbitPoint(orbit: DitherOrbitGeometry, phase: number) {
  const x = Math.cos(phase) * orbit.rx, y = Math.sin(phase) * orbit.ry
  return { x: orbit.x + x * Math.cos(orbit.tilt) - y * Math.sin(orbit.tilt), y: orbit.y + x * Math.sin(orbit.tilt) + y * Math.cos(orbit.tilt) }
}

/** Screen-space painter-order hit test. Decorative halos never steal a click. */
export function hitTestDitherAssets(assets: DitherAsset[], x: number, y: number): DitherAsset | null {
  for (let i = assets.length - 1; i >= 0; i--) {
    const asset = assets[i], radius = asset.radius * effectiveDitherParameters(asset.spec).size
    if (radius <= 0 || (asset.opacity ?? 1) < .25) continue
    const u = (x - asset.x) / radius, v = (y - asset.y) / radius, rotation = asset.rotation ?? 0
    const xx = u * Math.cos(rotation) - v * Math.sin(rotation), yy = u * Math.sin(rotation) + v * Math.cos(rotation)
    if (sampleDitherPixel(asset.spec, xx, yy, asset.phase ?? 0, undefined, undefined, asset.kind)[3] > 90) return asset
  }
  return null
}

export function satelliteAsset(parent: DitherPlanetSpec, satellite: { id: string; kind: 'friend' | 'music'; orbit: DitherOrbitGeometry; phase: number; radius: number }): DitherAsset {
  const spec: DitherPlanetSpec = { ...parent, seed: `${parent.seed}:${satellite.id}`, overrides: {
    ...parent.overrides, size: 1, form: satellite.kind === 'friend' ? 'particles' : 'organic',
    motif: satellite.kind === 'friend' ? 'dust' : 'tide', density: .72, pixelSize: 2, glow: .35,
  } }
  return { id: satellite.id, spec, kind: satellite.kind === 'music' ? 'music' : 'planet', ...orbitPoint(satellite.orbit, satellite.phase), radius: satellite.radius, rotation: satellite.phase }
}
