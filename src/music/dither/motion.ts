import { createDitherSpec, effectiveDitherParameters, stableHash, type DitherPlanetSpec } from './appearance'
import type { DitherAsset, DitherFrame } from './renderer'
import { MUSIC_TIDE_BEATS_PER_CYCLE, type MusicBeatClock } from '../audio-clock'
import { createMeteorShower } from './meteors'
import { observeSkyPoints } from './observation'

// A preview oscillator, NOT a measured song BPM. Replace the clock input with
// actual beat events when an authorized audio source is available.
export const DEFAULT_TIDE_BPM = 80 / MUSIC_TIDE_BEATS_PER_CYCLE
const TAU = Math.PI * 2, STEP = 1 / 120
export const PARTICLE_STRIDE = 6 // projected xy, material-home xy, CSS size, alpha
export const MAX_DITHER_CELLS = 65536
export type ParticleCloud = { count: number; points: Float32Array; grid?: number }
export type ParticleField = ParticleCloud & { homes: Float32Array; offsets: Float32Array; velocities: Float32Array }
type Pose = { spec: DitherPlanetSpec; phase: number; rotation: number; radius: number }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
function random(seed: string) {
  let state = stableHash(seed)
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}

/** The original shader's regular raster cells, not samples scattered on a
 * sphere. Material coordinates stay with each moving square. */
export function createDitherCellField(requestedGrid: number, previous?: ParticleField): ParticleField {
  const grid = clamp(Number.isFinite(requestedGrid) ? requestedGrid : 1, 1, 256 / 2.4)
  const side = Math.ceil(grid * 2.4), count = side * side
  const homes = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const x = (i % side + .5) / grid - 1.2, y = (Math.floor(i / side) + .5) / grid - 1.2
    homes.set([x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))], i * 3)
  }
  const field = { grid, count, homes, offsets: new Float32Array(count * 2), velocities: new Float32Array(count * 2), points: new Float32Array(count * PARTICLE_STRIDE) }
  if (previous?.grid && previous.count) {
    // Resample the physical state in material space when quality/size changes.
    // New cells inherit the nearby displacement AND momentum instead of
    // snapping the whole raster back to its home positions.
    const oldSide = Math.round(Math.sqrt(previous.count))
    for (let i = 0; i < count; i++) {
      const x = clamp((homes[i * 3] + 1.2) * previous.grid - .5, 0, oldSide - 1)
      const y = clamp((homes[i * 3 + 1] + 1.2) * previous.grid - .5, 0, oldSide - 1)
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, oldSide - 1), y1 = Math.min(y0 + 1, oldSide - 1)
      const fx = x - x0, fy = y - y0
      for (const [source, destination] of [[previous.offsets, field.offsets], [previous.velocities, field.velocities]]) {
        for (let axis = 0; axis < 2; axis++) {
          const top = source[(y0 * oldSide + x0) * 2 + axis] * (1 - fx) + source[(y0 * oldSide + x1) * 2 + axis] * fx
          const bottom = source[(y1 * oldSide + x0) * 2 + axis] * (1 - fx) + source[(y1 * oldSide + x1) * 2 + axis] * fx
          destination[i * 2 + axis] = top * (1 - fy) + bottom * fy
        }
      }
    }
  }
  return field
}

/** A crest and an undertow travel from the upper surface toward the lower rim.
 * Latitude and view depth delay each particle; tangential shear differs too.
 * No common scale is ever applied to the asset or its satellite orbit.
 */
export function particleTide(x: number, y: number, depth: number, seconds: number, strength: number, beat?: MusicBeatClock) {
  if (beat && !beat.playing) return { x: 0, y: 0 }
  const cycles = beat?.cycles ?? Math.round(((seconds * DEFAULT_TIDE_BPM / 60) % 1 + 1) % 1 * 1e6) / 1e6
  const phase = (cycles - (y + 1) * .23 - (1 - depth) * .19) * TAU
  const crest = ((1 + Math.cos(phase)) * .5) ** 6
  const undertow = .48 * ((1 + Math.cos(phase - 1.65)) * .5) ** 3
  const amplitude = .16 * Math.sqrt(clamp(strength, 0, 1)) * (beat && !beat.playing ? 0 : 1), wave = crest - undertow
  const shear = Math.sin(phase + y * 2) * amplitude * .23
  return { x: x * wave * amplitude - y * shear, y: y * wave * amplitude + x * shear }
}

/** Independent point velocities, normalized to the displayed sphere radius.
 * Small fixed substeps make the spring/vortex stable at different frame rates.
 */
export function stepParticleField(field: ParticleField, pose: Pose, delta: number, seconds: number, pointer: { x: number; y: number } | undefined, running: boolean, beat?: MusicBeatClock) {
  const p = effectiveDitherParameters(pose.spec)
  const cr = Math.cos(pose.rotation), sr = Math.sin(pose.rotation)
  const steps = running ? Math.ceil(clamp(delta, 0, .05) / STEP) : 0
  const dt = steps ? clamp(delta, 0, .05) / steps : 0
  const cursor = p.pointer !== 'off' ? pointer : undefined
  const reach = clamp(80 / Math.max(1, pose.radius), .25, .85), force = p.pointer === 'strong' ? 26 : 17
  const cellSize = pose.radius / (field.grid ?? pose.radius / p.pixelSize)
  for (let i = 0; i < field.count; i++) {
    const hi = i * 3, oi = i * 2, pi = i * PARTICLE_STRIDE
    const nx = field.homes[hi], ny = field.homes[hi + 1], nz = field.homes[hi + 2]
    const hx = nx * cr - ny * sr, hy = nx * sr + ny * cr
    const tide = particleTide(hx, hy, Math.max(0, nz), seconds, p.pulse, beat)
    let ox = field.offsets[oi], oy = field.offsets[oi + 1], vx = field.velocities[oi], vy = field.velocities[oi + 1]
    for (let step = 0; step < steps; step++) {
      let ax = (tide.x - ox) * 100 - vx * 8, ay = (tide.y - oy) * 100 - vy * 8
      if (cursor) {
        let dx = hx + ox - cursor.x, dy = hy + oy - cursor.y
        const distance = Math.hypot(dx, dy)
        if (distance < reach) {
          // The tiny seeded nudge also separates a point directly under a cursor.
          if (distance < .002) { dx = Math.cos(i) * .002; dy = Math.sin(i) * .002 }
          const norm = Math.max(.002, distance), falloff = (1 - distance / reach) ** 2
          const radial = force * falloff * (1 + .22 * Math.cos(seconds * 7 + ny * 8))
          const swirl = force * .95 * falloff * (1 + .3 * Math.sin(seconds * 5 + nx * 7))
          ax += (dx * radial - dy * swirl) / norm
          ay += (dy * radial + dx * swirl) / norm
        }
      }
      vx = clamp(vx + ax * dt, -3, 3); vy = clamp(vy + ay * dt, -3, 3)
      ox = clamp(ox + vx * dt, -.6, .6); oy = clamp(oy + vy * dt, -.6, .6)
    }
    field.offsets[oi] = ox; field.offsets[oi + 1] = oy
    field.velocities[oi] = vx; field.velocities[oi + 1] = vy
    field.points[pi] = hx + ox; field.points[pi + 1] = hy + oy
    field.points[pi + 2] = hx; field.points[pi + 3] = hy
    field.points[pi + 4] = cellSize
    field.points[pi + 5] = 1 // Silhouette/halo alpha is sampled by the original shader.
  }
  return field
}

export function createGalaxyBackdrop(seed: string): ParticleField {
  const count = 240, rnd = random(seed), homes = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) homes.set([rnd(), rnd(), rnd()], i * 3)
  return { count, homes, offsets: new Float32Array(count * 2), velocities: new Float32Array(count * 2), points: new Float32Array(count * PARTICLE_STRIDE) }
}

export function updateGalaxyBackdrop(field: ParticleField, width: number, height: number, delta: number, seconds: number, pointer: { x: number; y: number } | undefined, running: boolean) {
  const steps = running ? Math.ceil(clamp(delta, 0, .05) / STEP) : 0, dt = steps ? clamp(delta, 0, .05) / steps : 0
  for (let i = 0; i < field.count; i++) {
    const hi = i * 3, oi = i * 2, pi = i * PARTICLE_STRIDE, seed = field.homes[hi + 2]
    const hx = field.homes[hi] * width + Math.sin(seconds * .09 + seed * 30) * (2 + seed * 5)
    const hy = field.homes[hi + 1] * height + Math.cos(seconds * .07 + seed * 25) * (2 + seed * 4)
    let ox = field.offsets[oi], oy = field.offsets[oi + 1], vx = field.velocities[oi], vy = field.velocities[oi + 1]
    for (let step = 0; step < steps; step++) {
      let ax = -ox * 24 - vx * 7, ay = -oy * 24 - vy * 7
      if (pointer) {
        const dx = hx + ox - pointer.x, dy = hy + oy - pointer.y, distance = Math.max(1, Math.hypot(dx, dy))
        const force = Math.max(0, 1 - distance / 155) ** 2 * (180 + seed * 220)
        ax += (dx - dy * .75) / distance * force; ay += (dy + dx * .75) / distance * force
      }
      vx += ax * dt; vy += ay * dt; ox += vx * dt; oy += vy * dt
    }
    field.offsets[oi] = ox; field.offsets[oi + 1] = oy; field.velocities[oi] = vx; field.velocities[oi + 1] = vy
    field.points[pi] = hx + ox; field.points[pi + 1] = hy + oy
    field.points[pi + 2] = seed; field.points[pi + 3] = 0
    field.points[pi + 4] = seed > .93 ? 4.5 : 1.4 + seed * 1.9
    // Asynchronous 3–8 second twinkles. No full-screen flashes or rapid strobe.
    field.points[pi + 5] = .3 + .6 * ((1 + Math.sin(seconds * (.8 + seed * 1.3) + seed * 60)) * .5) ** 3
  }
  return field
}

/** Per-scene state. All assets share three GPU programs; no context per planet.
 * The largest body gets priority, while small satellites use fewer points.
 */
export function createDitherMotion() {
  const fields = new Map<string, { seed: string; low: boolean; pixelSize: number; field: ParticleField }>()
  const stars = createGalaxyBackdrop('moodverse-galaxy-stars')
  const meteors = createMeteorShower()
  const cloudSpec = createDitherSpec({ planetId: 'galaxy-live-flow', tracks: [], overrides: { motif: 'flow', size: 1, pointer: 'weak', density: .32, pixelSize: 5, speed: .1, glow: .2, blue: .7, violet: .8, pink: .45 } })
  let cloudPointer: { x: number; y: number } | undefined, pointerPower = 0
  return {
    apply(frame: DitherFrame, delta: number, seconds: number, running: boolean, low: boolean, beat?: MusicBeatClock) {
      const camera=frame.observation
      frame.meteors = observeSkyPoints(meteors.advance(delta, frame.width, frame.height, running),camera,frame.width,frame.height)
      let budget = low ? 30000 : 100000
      const visible = new Set(frame.assets.map(a => a.id))
      for (const id of fields.keys()) if (!visible.has(id)) fields.delete(id)
      const bodies = frame.assets.filter(a => a.kind !== 'nebula' && a.kind !== 'music' && (a.detail ?? 0)<1 && a.radius > 0 && (a.opacity ?? 1) > 0).sort((a, b) => b.radius - a.radius)
      for(const asset of frame.assets) if((asset.detail ?? 0)>=1){asset.particles=undefined;fields.delete(asset.id)}
      const totalWeight = bodies.reduce((n, a) => n + (a.radius * effectiveDitherParameters(a.spec).size) ** 2, 0)
      const distributable = Math.max(0, budget - bodies.length * 128)
      for (const [index, asset] of bodies.entries()) {
        const p = effectiveDitherParameters(asset.spec), radius = asset.radius * p.size
        const fairShare = 128 + Math.floor(distributable * radius * radius / Math.max(1, totalWeight))
        const available = Math.max(0, budget - (bodies.length - index - 1) * 128)
        const grid = Math.min(radius / (asset.pixelSize ?? p.pixelSize), Math.floor(Math.sqrt(Math.min(available, fairShare, low ? 15000 : MAX_DITHER_CELLS))) / 2.4)
        const desired = Math.ceil(grid * 2.4) ** 2
        const seed = `${asset.spec.seed}:${p.seedOffset}`, existing = fields.get(asset.id)
        // Perspective changes a satellite's radius every frame. Keep its point
        // identities/velocity until a substantial size or quality change.
        const reuse = existing?.seed === seed && existing.low === low && existing.pixelSize === p.pixelSize && existing.field.count <= available && existing.field.count >= desired * .6 && existing.field.count <= desired * 2
        const count = reuse ? existing.field.count : desired
        if (count < 1) continue
        budget -= count
        const field = reuse ? existing.field : createDitherCellField(grid, existing?.seed === seed ? existing.field : undefined)
        fields.set(asset.id, { seed, low, pixelSize: p.pixelSize, field })
        const pointer = frame.pointer ? { x: (frame.pointer.x - asset.x) / radius, y: (frame.pointer.y - asset.y) / radius } : undefined
        asset.particles = stepParticleField(field, { spec: asset.spec, phase: asset.phase ?? frame.phase, rotation: asset.rotation ?? 0, radius }, delta, seconds, pointer, running, beat)
      }
      const opacity = frame.ambience ?? 0
      if (opacity > 0) {
        const skyPointer=frame.pointer && camera ? {x:frame.width/2+(frame.pointer.x-frame.width/2-camera.x)/camera.zoom,y:frame.height/2+(frame.pointer.y-frame.height/2-camera.y)/camera.zoom} : frame.pointer
        updateGalaxyBackdrop(stars, frame.width, frame.height, delta, seconds, skyPointer, running)
        const ease = running ? 1 - Math.exp(-clamp(delta, 0, .05) * 6) : 0
        if (skyPointer) {
          cloudPointer ??= { ...skyPointer }
          cloudPointer.x += (skyPointer.x - cloudPointer.x) * ease
          cloudPointer.y += (skyPointer.y - cloudPointer.y) * ease
        }
        pointerPower += ((frame.pointer ? 1 : 0) - pointerPower) * ease
        const clouds: DitherAsset[] = [{ id: 'galaxy-live-flow', kind: 'nebula', spec: cloudSpec, x: frame.width / 2, y: frame.height / 2, radius: Math.max(frame.width, frame.height) / 2, phase: seconds, opacity, backgroundField: true, backgroundView:camera, pointerPower }]
        frame.background = { stars:observeSkyPoints(stars,camera,frame.width,frame.height), clouds, opacity, pointer: cloudPointer }
      } else {
        frame.background = undefined
      }
    },
    get size() { return fields.size },
  }
}
