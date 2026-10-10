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

type HitSampling = { mode?: 'webgl2' | 'canvas2d'; pointer?: { x: number; y: number }; pixelRatio?: number; materialGrid?: number; bodyTargets?: boolean }
/** Match the actual renderer's pixel-cell centers, including cached fallback. */
export function sampleDitherAssetAlpha(asset: DitherAsset, x: number, y: number, sampling: HitSampling = {}): number {
  const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size
  if (radius <= 0) return 0
  const ratio = sampling.mode === 'canvas2d' ? 1 : sampling.pixelRatio ?? 1
  const screenX = (Math.floor(x * ratio) + .5) / ratio, screenY = (Math.floor(y * ratio) + .5) / ratio
  let u = (screenX - asset.x) / radius, v = (screenY - asset.y) / radius
  if ((Math.abs(u) > 1.2 || Math.abs(v) > 1.2) && !asset.particles) return 0
  if (!asset.particles && !asset.detail && sampling.mode !== 'canvas2d' && sampling.pointer && p.pointer !== 'off') {
    const dx = u - (sampling.pointer.x - asset.x) / radius, dy = v - (sampling.pointer.y - asset.y) / radius
    const warp = Math.exp(-(dx * dx + dy * dy) * 6) * (p.pointer === 'strong' ? .15 : .06)
    u += dx * warp; v += dy * warp
  }
  const rotation = asset.rotation ?? 0
  const xx = u * Math.cos(rotation) + v * Math.sin(rotation), yy = -u * Math.sin(rotation) + v * Math.cos(rotation)
  let gridX: number, gridY: number, px: number, py: number
  if (sampling.mode === 'canvas2d') {
    const detail=Math.round((asset.detail ?? 0)*16)/16
    const size = detail===1 && asset.spec.coverTexture ? 512 : radius > 100 ? 256 : 128, cell = Math.max(1, Math.round((asset.pixelSize==null?p.pixelSize:Math.round(asset.pixelSize*4)/4) * (1-detail) * size / 256))
    gridX = Math.floor(Math.floor((xx / 2.4 + .5) * size) / cell)
    gridY = Math.floor(Math.floor((yy / 2.4 + .5) * size) / cell)
    px = ((gridX + .5) * cell / size - .5) * 2.4
    py = ((gridY + .5) * cell / size - .5) * 2.4
  } else {
    const grid = sampling.materialGrid ?? asset.particles?.grid ?? radius / (asset.pixelSize ?? p.pixelSize)
    gridX = Math.floor((xx + 1.2) * grid); gridY = Math.floor((yy + 1.2) * grid)
    px = (gridX + .5) / grid - 1.2; py = (gridY + .5) / grid - 1.2
  }
  const particleBody = asset.particles && sampling.mode !== 'canvas2d'
  let alpha = particleBody || Math.abs(u) > 1.2 || Math.abs(v) > 1.2 ? 0 : sampleDitherPixel(asset.spec, px, py, sampling.mode === 'canvas2d' ? 0 : asset.phase ?? 0, gridX, gridY, asset.kind, rotation, undefined, asset.orientation)[3] * (asset.opacity ?? 1)
  const detail=asset.detail ?? 0
  if(detail>0 && sampling.mode!=='canvas2d') {
    const smoothAlpha=sampleDitherPixel(asset.spec,xx,yy,asset.phase ?? 0,0,0,asset.kind,rotation,undefined,asset.orientation,1)[3]*(asset.opacity ?? 1)
    alpha=asset.particles?smoothAlpha*detail:smoothAlpha
  }
  // Moving points can extend beyond the old quad; pick their visible pixels,
  // not a fixed enlarged halo. Painter order still hides a rear satellite.
  if (asset.particles && sampling.mode !== 'canvas2d' && alpha <= 90) {
    const { points, count } = asset.particles
    for (let i = 0; i < count; i++) {
      const n = i * 6
      if (points[n + 5] <= 0) continue
      const dx = screenX - asset.x - points[n] * radius, dy = screenY - asset.y - points[n + 1] * radius
      const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation), localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation)
      if (Math.max(Math.abs(localX), Math.abs(localY)) > points[n + 4] * .5) continue
      const grid = asset.particles.grid ?? radius / (asset.pixelSize ?? p.pixelSize)
      const hx = points[n + 2] * Math.cos(rotation) + points[n + 3] * Math.sin(rotation)
      const hy = -points[n + 2] * Math.sin(rotation) + points[n + 3] * Math.cos(rotation)
      const gx = Math.floor((hx + 1.2) * grid), gy = Math.floor((hy + 1.2) * grid)
      const cellAlpha = sampleDitherPixel(asset.spec, (gx + .5) / grid - 1.2, (gy + .5) / grid - 1.2, asset.phase ?? 0, gx, gy, asset.kind, rotation, undefined, asset.orientation)[3]
      alpha += cellAlpha * (asset.opacity ?? 1) * points[n + 5] * (1-detail) * (1 - alpha / 255)
      if (alpha > 90) break
    }
  }
  return alpha
}

/** Screen-space painter-order hit test. Decorative halos never steal a click. */
export function hitTestDitherAssets(assets: DitherAsset[], x: number, y: number, sampling: HitSampling = {}): DitherAsset | null {
  let bodyTarget: DitherAsset | null = null
  for (let i = assets.length - 1; i >= 0; i--) {
    const asset = assets[i], radius = asset.radius * effectiveDitherParameters(asset.spec).size
    if (radius <= 0 || (asset.opacity ?? 1) < .25) continue
    if (sampleDitherAssetAlpha(asset, x, y, sampling) > 90) return asset
    const bodyAlpha = sampleDitherAssetAlpha({ ...asset, particles: undefined, opacity: 1 }, x, y, { ...sampling, pointer: undefined, materialGrid: asset.particles?.grid })
    if (bodyAlpha > 91 && sampling.bodyTargets) {
      if (!asset.particles || sampling.mode === 'canvas2d') return asset
      // Hover must not erase the object's interaction target. Prefer every
      // actually visible rear object first; only then use the vacated body.
      bodyTarget ??= asset
    }
  }
  return bodyTarget
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
