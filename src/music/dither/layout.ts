import { effectiveDitherParameters, type DitherPlanetSpec } from './appearance'
import type { DitherAsset } from './renderer'
import { sampleDitherPixel } from './sampler'

export type DitherOrbitGeometry = { x: number; y: number; rx: number; ry: number; tilt: number }
export function orbitPoint(orbit: DitherOrbitGeometry, phase: number) {
  const x = Math.cos(phase) * orbit.rx, y = Math.sin(phase) * orbit.ry
  return { x: orbit.x + x * Math.cos(orbit.tilt) - y * Math.sin(orbit.tilt), y: orbit.y + x * Math.sin(orbit.tilt) + y * Math.cos(orbit.tilt) }
}

/** Lift the displayed ellipse into a circular orbit with view-space depth.
 * Positive depth is in front; screen tilt must not determine occlusion.
 */
export function orbitDepth(orbit: DitherOrbitGeometry, phase: number): number {
  return Math.sin(phase) * Math.sqrt(Math.max(0, orbit.rx * orbit.rx - orbit.ry * orbit.ry))
}
export function depthOrderedAssets(assets: DitherAsset[]): DitherAsset[] {
  return [...assets].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
}

type HitSampling = { mode?: 'webgl2' | 'canvas2d'; pointer?: { x: number; y: number }; pixelRatio?: number }
/** Match the actual renderer's pixel-cell centers, including cached fallback. */
export function sampleDitherAssetAlpha(asset: DitherAsset, x: number, y: number, sampling: HitSampling = {}): number {
  const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size
  if (radius <= 0) return 0
  const ratio = sampling.mode === 'canvas2d' ? 1 : sampling.pixelRatio ?? 1
  const screenX = (Math.floor(x * ratio) + .5) / ratio, screenY = (Math.floor(y * ratio) + .5) / ratio
  let u = (screenX - asset.x) / radius, v = (screenY - asset.y) / radius
  if (Math.abs(u) > 1.2 || Math.abs(v) > 1.2) return 0
  if (sampling.mode !== 'canvas2d' && sampling.pointer && p.pointer !== 'off') {
    const dx = u - (sampling.pointer.x - asset.x) / radius, dy = v - (sampling.pointer.y - asset.y) / radius
    const warp = Math.exp(-(dx * dx + dy * dy) * 6) * (p.pointer === 'strong' ? .15 : .06)
    u += dx * warp; v += dy * warp
  }
  const rotation = asset.rotation ?? 0
  const xx = u * Math.cos(rotation) + v * Math.sin(rotation), yy = -u * Math.sin(rotation) + v * Math.cos(rotation)
  let gridX: number, gridY: number, px: number, py: number
  if (sampling.mode === 'canvas2d') {
    const size = radius > 100 ? 256 : 128, cell = Math.max(1, Math.round(p.pixelSize * size / 256))
    gridX = Math.floor(Math.floor((xx / 2.4 + .5) * size) / cell)
    gridY = Math.floor(Math.floor((yy / 2.4 + .5) * size) / cell)
    px = ((gridX + .5) * cell / size - .5) * 2.4
    py = ((gridY + .5) * cell / size - .5) * 2.4
  } else {
    const grid = radius / p.pixelSize
    gridX = Math.floor((xx + 1.2) * grid); gridY = Math.floor((yy + 1.2) * grid)
    px = (gridX + .5) / grid - 1.2; py = (gridY + .5) / grid - 1.2
  }
  return sampleDitherPixel(asset.spec, px, py, sampling.mode === 'canvas2d' ? 0 : asset.phase ?? 0, gridX, gridY, asset.kind)[3] * (asset.opacity ?? 1)
}

/** Screen-space painter-order hit test. Decorative halos never steal a click. */
export function hitTestDitherAssets(assets: DitherAsset[], x: number, y: number, sampling: HitSampling = {}): DitherAsset | null {
  for (let i = assets.length - 1; i >= 0; i--) {
    const asset = assets[i], radius = asset.radius * effectiveDitherParameters(asset.spec).size
    if (radius <= 0 || (asset.opacity ?? 1) < .25) continue
    if (sampleDitherAssetAlpha(asset, x, y, sampling) > 90) return asset
  }
  return null
}

export function satelliteAsset(parent: DitherPlanetSpec, satellite: { id: string; kind: 'friend' | 'music'; orbit: DitherOrbitGeometry; phase: number; radius: number }): DitherAsset {
  const spec: DitherPlanetSpec = { ...parent, seed: `${parent.seed}:${satellite.id}`, overrides: {
    ...parent.overrides, size: 1, form: satellite.kind === 'friend' ? 'particles' : 'organic',
    motif: satellite.kind === 'friend' ? 'dust' : 'tide', density: .72, pixelSize: 2, glow: .35,
  } }
  const depth = orbitDepth(satellite.orbit, satellite.phase)
  const perspective = 1 + depth / Math.max(1, satellite.orbit.rx) * .12
  return { id: satellite.id, spec, kind: satellite.kind === 'music' ? 'music-satellite' : 'planet', ...orbitPoint(satellite.orbit, satellite.phase), depth, radius: satellite.radius * perspective, rotation: satellite.phase }
}
