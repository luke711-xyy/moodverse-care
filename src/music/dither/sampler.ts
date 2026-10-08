import { DITHER_PALETTE, effectiveDitherParameters, stableHash, type DitherPlanetSpec } from './appearance'

const TAU = Math.PI * 2
export type DitherAssetKind = 'planet' | 'star' | 'music'
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const fract = (x: number) => x - Math.floor(x)
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const hash = (x: number, y: number, seed: number) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * .013) * 43758.5453)
const phaseOf = (t: number) => Math.round(((t % TAU + TAU) % TAU) * 1e6) / 1e6
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const blue = rgb(DITHER_PALETTE.blue), violet = rgb(DITHER_PALETTE.violet), pink = rgb(DITHER_PALETTE.pink), black = rgb(DITHER_PALETTE.black), white = rgb(DITHER_PALETTE.white)

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0, 1, fract(x)), fy = smooth(0, 1, fract(y))
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed)
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}
function fbm(x: number, y: number, seed: number) {
  let sum = 0, amplitude = .5
  for (let i = 0; i < 4; i++) { sum += noise(x, y, seed + i * 17) * amplitude; x = x * 2.02 + 3.4; y = y * 2.02 + 4.1; amplitude *= .5 }
  return sum
}
function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))
  return Math.hypot(x - ax - dx * t, y - ay - dy * t)
}

export function ditherThreshold(algorithm: string, x: number, y: number, seed: number): number {
  x = Math.floor(x); y = Math.floor(y)
  if (algorithm === 'noise') return hash(x, y, seed)
  if (algorithm === 'cluster') return clamp(Math.hypot(fract((x + y) / 8) - .5, fract((x - y) / 8) - .5) * 1.7)
  const levels = algorithm === 'bayer4' ? 2 : 3
  let rank = 0
  for (let bit = 0; bit < levels; bit++) {
    const bx = (x >> bit) & 1, by = (y >> bit) & 1
    rank = rank * 4 + [0, 2, 3, 1][by * 2 + bx]
  }
  return (rank + .5) / (4 ** levels)
}

export function advanceDitherPhase(previous: number, dt: number, speed: number, running: boolean): number {
  return running ? (previous + Math.max(0, Math.min(.05, dt)) * Math.max(0, Math.min(1.5, speed)) * .2) % TAU : previous
}

/** Normalized asset coordinates, no perspective, terrain mesh, light or camera. */
export function sampleDitherPixel(spec: DitherPlanetSpec, x: number, y: number, time = 0, gridX = Math.floor(x * 64), gridY = Math.floor(y * 64), kind: DitherAssetKind = 'planet'): [number, number, number, number] {
  const p = effectiveDitherParameters(spec), seed = (stableHash(spec.seed) % 65536) + p.seedOffset, t = phaseOf(time)
  const r = Math.hypot(x, y), a = Math.atan2(y, x)
  const breathing = Math.sin(t) * p.pulse * .035
  let radius = .85 + breathing
  if (p.form === 'organic') radius += .055 * Math.sin(a * 3 + t) + .035 * Math.cos(a * 7 - t * 2)
  if (p.form === 'pulse') radius += .04 * Math.cos(a * 8 - t)
  let alpha = 1 - smooth(radius - .015, radius + .025, r)
  const halo = Math.exp(-Math.max(0, r - radius) * 22) * p.glow * .16
  alpha = Math.max(alpha, r < 1.15 ? halo : 0)
  if (alpha < .008) return [0, 0, 0, 0]
  const scale = 2 + p.textureScale * 6
  const warp = fbm(x * 3 + Math.cos(t) * .4, y * 3 + Math.sin(t) * .4, seed) - .5
  const wx = x + warp * p.disturbance * .35, wy = y + warp * p.disturbance * .25
  let tone = .2
  if (p.motif === 'flow') {
    const n = fbm(wx * scale + Math.cos(t), wy * scale + Math.sin(t), seed)
    tone = .18 + .7 * Math.pow(.5 + .5 * Math.sin((wx * 3 + wy * .6 + n * 1.6) * 8 + Math.sin(t)), 2)
  } else if (p.motif === 'tide') {
    tone = .2 + .55 * Math.pow(.5 + .5 * Math.cos(r * (16 + scale) + warp * 4 + Math.sin(t)), 3)
  } else if (p.motif === 'digital') {
    const xx = Math.floor(wx * 18), yy = Math.floor(wy * 11)
    tone = .15 + .6 * hash(xx, yy, seed) * (.4 + .6 * (1 - smooth(.1, .3, Math.abs(fract(wy * 11) - .5))))
  } else if (p.motif === 'dust') {
    const xx = Math.floor(wx * 24), yy = Math.floor(wy * 24)
    const star = hash(xx, yy, seed) > 1 - p.density * .3
    tone = .2 + .6 * fbm(wx * 4 + Math.cos(t), wy * 4 + Math.sin(t), seed) + (star ? .3 : 0)
  } else if (p.motif === 'prism') {
    tone = .18 + .55 * Math.abs(Math.sin(a * 3 + r * scale * 2 + Math.sin(t)))
  } else if (p.motif === 'flower') {
    const petals = (1 - smooth(.06, .19, Math.abs(Math.sin(a * 3 - r * 3.3 + Math.sin(t) * .15)))) * smooth(.12, .25, r) * (1 - smooth(.61, .75, r))
    const filaments = (1 - smooth(.018, .05, Math.abs(Math.sin(a * 11 + r * 3)))) * smooth(.2, .3, r) * (1 - smooth(.7, .83, r))
    let anthers = 0
    for (let i = 0; i < 11; i++) {
      const angle = i * TAU / 11, length = .79 - .025 * Math.sin(i)
      anthers = Math.max(anthers, 1 - smooth(.009, .023, Math.hypot(x - Math.cos(angle) * length, y - Math.sin(angle) * length)))
    }
    tone = .13 + petals * .7 + filaments * .65 + .85 * anthers + .3 * (1 - smooth(0, .13, r))
  } else if (p.motif === 'score') {
    const lineY = wy + Math.sin(wx * 3 + t) * .04
    const staff = 1 - smooth(.01, .025, Math.abs(fract((lineY + .5) * 5) - .5) / 5)
    let notes = 0
    for (let i = 0; i < 7; i++) {
      const nx = -.65 + i * .21, ny = (hash(i, 0, seed) - .5) * .6 + Math.sin(t + i) * .02
      notes = Math.max(notes, 1 - smooth(.035, .06, Math.hypot((wx - nx) * .8, (wy - ny) * 1.3)))
      notes = Math.max(notes, 1 - smooth(.008, .022, segment(wx, wy, nx + .035, ny, nx + .035, ny - .23)))
    }
    tone = .15 + staff * .3 + notes * .7
  }
  if (p.form === 'particles') tone *= .25 + .75 * Number(hash(Math.floor(x * 65), Math.floor(y * 65), seed) < p.density)
  if (p.form === 'pulse') tone += .2 * Math.pow(Math.max(0, Math.cos(a * 8 + t)), 12) * smooth(.25, .8, r)
  if (p.form === 'annulus') tone = r < .29 ? .025 : tone * .5 + .4 * (1 - smooth(.015, .06, Math.abs(Math.hypot(x, y * 1.4) - .6)))
  if (kind === 'star') tone = .85 - .3 * r + .15 * noise(x * 30, y * 30, seed)
  if (kind === 'music') tone = r < .16 ? .03 : .2 + .45 * (.5 + .5 * Math.cos(r * 110)) + .18 * Math.sin(a * 2 + t)
  tone = clamp((Math.pow(clamp(tone), p.gamma) - .5) * p.contrast + .5)
  tone = clamp(tone * p.exposure)
  const q = Math.floor(tone * 4 + ditherThreshold(p.algorithm, gridX, gridY, seed)) / 4
  const hue = .5 + .5 * Math.sin(a + warp * 3 + Math.sin(t))
  const weights = [p.blue * (.05 + 2 * (1 - hue) ** 2), p.violet * (.25 + .5 * (1 - Math.abs(.5 - hue) * 2)), p.pink * (.05 + 2 * hue ** 2)], sum = weights.reduce((n, v) => n + v, 0)
  const colors = [blue, violet, pink]
  const color = [0, 1, 2].map((channel) => {
    const c = colors.reduce((n, v, i) => n + v[channel] * weights[i] / sum, 0)
    const lit = c + (white[channel] - c) * Math.max(0, q - .9) * 1.5
    return Math.round(black[channel] + (lit - black[channel]) * q)
  })
  return [color[0], color[1], color[2], Math.round(clamp(alpha) * 255)]
}

export function renderDitherImage(spec: DitherPlanetSpec, size: number, time = 0, kind: DitherAssetKind = 'planet'): Uint8ClampedArray {
  if (!Number.isInteger(size) || size < 8 || size > 512) throw new Error('INVALID_DITHER_IMAGE_SIZE')
  const pixels = new Uint8ClampedArray(size * size * 4), p = effectiveDitherParameters(spec)
  const cell = Math.max(1, Math.round(p.pixelSize * size / 256))
  for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
    const gx = Math.floor(xx / cell), gy = Math.floor(yy / cell)
    const x = ((gx + .5) * cell / size - .5) * 2.4, y = ((gy + .5) * cell / size - .5) * 2.4
    pixels.set(sampleDitherPixel(spec, x, y, time, gx, gy, kind), (yy * size + xx) * 4)
  }
  return pixels
}
