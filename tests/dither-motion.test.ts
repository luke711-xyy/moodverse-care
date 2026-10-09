import { expect, test } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createDitherCellField, DEFAULT_TIDE_BPM, particleTide, stepParticleField, createGalaxyBackdrop, updateGalaxyBackdrop, createDitherMotion } from '../src/music/dither/motion'
import type { DitherFrame } from '../src/music/dither/renderer'
import * as motion from '../src/music/dither/motion'

const spec = createDitherSpec({ planetId: 'motion', tracks: [], overrides: { size: 1, pulse: .5, pointer: 'strong' } })
const pose = { spec, phase: .3, rotation: 0, radius: 180 }
const energy = (field: ReturnType<typeof createDitherCellField>) => field.offsets.reduce((sum, n) => sum + n * n, 0)

test('material pixels tile the original dither grid instead of a scattered sphere cloud', () => {
  expect(typeof motion.createDitherCellField).toBe('function')
  const field = motion.createDitherCellField(5)
  expect(field.count).toBe(144) // 2.4 × 5 = 12 cells on each axis.
  expect(field.homes[0]).toBeCloseTo(-1.1)
  expect(field.homes[3]).toBeCloseTo(-.9)
  expect(field.homes[12 * 3 + 1]).toBeCloseTo(-.9)
  stepParticleField(field, { ...pose, radius: 15, rotation: 0 }, 0, 0, undefined, false)
  expect(field.points[0]).toBeCloseTo(-1.1)
  expect(field.points[1]).toBeCloseTo(-1.1)
  expect(field.points[4]).toBeCloseTo(3)
  expect(field.points[5]).toBe(1)
})

test('pixel grids are deterministic, bounded and do not change on a redraw', () => {
  const a = createDitherCellField(10), b = createDitherCellField(10)
  expect(a.homes).toEqual(b.homes)
  expect(a.count).toBe(576)
  expect(createDitherCellField(1e8).count).toBeLessThanOrEqual(65536)
  expect([...a.homes].every(Number.isFinite)).toBe(true)
})

test('the temporary 80 BPM song drives a half-time tide through the shell rather than scaling it uniformly', () => {
  expect(DEFAULT_TIDE_BPM).toBe(40)
  const north = particleTide(.4, -.6, .7, .14, .5), south = particleTide(.4, .6, .7, .14, .5)
  expect(north.x / .4).not.toBeCloseTo(south.x / .4, 3)
  expect(north).toEqual(particleTide(.4, -.6, .7, .14 + 60 / DEFAULT_TIDE_BPM, .5))
  expect(Math.hypot(north.x, north.y)).toBeLessThan(.2)
})
test('a supplied media beat overrides elapsed scene time and pausing removes the music tide', () => {
  const beat={cycles:.2,bpm:105.1,playing:true}
  expect(particleTide(.4,-.6,.7,0,.5,beat)).toEqual(particleTide(.4,-.6,.7,99,.5,beat))
  expect(particleTide(.4,-.6,.7,0,.5,{...beat,playing:false})).toEqual({x:0,y:0})
})

test('the cursor gives particles tangential momentum, then they reform after leaving', () => {
  const field = createDitherCellField(10)
  const quiet = { ...pose, spec: { ...spec, overrides: { ...spec.overrides, pulse: 0 } } }
  for (let i = 0; i < 45; i++) stepParticleField(field, quiet, 1 / 60, 0, { x: .35, y: .1 }, true)
  const disturbed = energy(field)
  expect(disturbed).toBeGreaterThan(.1)
  let tangential = 0
  for (let i = 0; i < field.count; i++) tangential += Math.abs(field.velocities[i * 2 + 1])
  expect(tangential).toBeGreaterThan(1)
  stepParticleField(field, quiet, 1 / 60, 0, undefined, true)
  expect(energy(field)).toBeGreaterThan(.05) // Not an instantaneous texture warp.
  for (let i = 0; i < 300; i++) stepParticleField(field, quiet, 1 / 60, 0, undefined, true)
  expect(energy(field)).toBeLessThan(disturbed * .01)
})

test('off pointers, pause, large deltas and long simulation stay safe', () => {
  const field = createDitherCellField(5)
  const off = { ...pose, spec: { ...spec, overrides: { ...spec.overrides, pulse: 0, pointer: 'off' as const } } }
  stepParticleField(field, off, 1 / 60, 0, { x: 0, y: 0 }, true)
  expect(energy(field)).toBe(0)
  const before = field.offsets.slice()
  stepParticleField(field, pose, 99, 99, { x: .2, y: .2 }, false)
  expect(field.offsets).toEqual(before)
  for (let i = 0; i < 300; i++) stepParticleField(field, pose, 99, i * .05, { x: .2, y: .2 }, true)
  expect([...field.points, ...field.velocities].every(Number.isFinite)).toBe(true)
  expect(Math.max(...field.offsets.map(Math.abs))).toBeLessThan(.7)
})

test('fixed substeps give equivalent cursor displacement at 30 and 60 FPS', () => {
  const a = createDitherCellField(5), b = createDitherCellField(5)
  const quiet = { ...pose, spec: { ...spec, overrides: { ...spec.overrides, pulse: 0 } } }
  for (let i = 0; i < 60; i++) stepParticleField(a, quiet, 1 / 60, 0, { x: .3, y: 0 }, true)
  for (let i = 0; i < 30; i++) stepParticleField(b, quiet, 1 / 30, 0, { x: .3, y: 0 }, true)
  expect(Math.max(...a.offsets.map((n, i) => Math.abs(n - b.offsets[i])))).toBeLessThan(1e-5)
})

test('Galaxy stars twinkle asynchronously, react to the mouse and remain static when paused', () => {
  const field = createGalaxyBackdrop('galaxy'), copy = createGalaxyBackdrop('galaxy')
  updateGalaxyBackdrop(field, 1000, 700, .02, 0, undefined, true)
  updateGalaxyBackdrop(copy, 1000, 700, .02, 1, undefined, true)
  const alphas = Array.from({ length: field.count }, (_, i) => field.points[i * 6 + 5])
  const later = Array.from({ length: copy.count }, (_, i) => copy.points[i * 6 + 5])
  expect(later).not.toEqual(alphas)
  expect(Math.min(...alphas)).toBeGreaterThan(0)
  const x = field.points[0], y = field.points[1]
  for (let i = 0; i < 40; i++) updateGalaxyBackdrop(field, 1000, 700, 1 / 60, 1, { x: x + 12, y: y + 8 }, true)
  expect(Math.hypot(field.points[0] - x, field.points[1] - y)).toBeGreaterThan(2)
  const before = field.offsets.slice()
  updateGalaxyBackdrop(field, 1000, 700, 1, 1, { x, y }, false)
  expect(field.offsets).toEqual(before)
})

test('scene budgets, perspective redraw continuity and removed-asset cleanup are bounded', () => {
  const engine = createDitherMotion()
  const frame: DitherFrame = { width: 1000, height: 700, phase: 0, assets: Array.from({ length: 50 }, (_, i) => ({ id: 'planet-' + i, spec, x: 500, y: 300, radius: i ? 80 : 190 })) }
  engine.apply(frame, .02, 0, true, false)
  expect(frame.assets.reduce((sum, a) => sum + (a.particles?.count ?? 0), 0)).toBeLessThanOrEqual(100000)
  const first = frame.assets[0].particles
  const next: DitherFrame = { ...frame, assets: [{ ...frame.assets[0], radius: 191, particles: undefined }] }
  // Keep the same identities under the same population of visible objects.
  const perspective: DitherFrame = { ...frame, assets: frame.assets.map((a, i) => ({ ...a, radius: i ? a.radius : 191, particles: undefined })) }
  engine.apply(perspective, .02, .02, true, false)
  expect(perspective.assets[0].particles === first).toBe(true)
  engine.apply(next, .02, .02, true, false)
  expect(engine.size).toBe(1)
  engine.apply(next, .02, .04, true, true)
  expect(next.assets[0].particles!.count).toBeLessThanOrEqual(15000)
})

test('all visible bodies receive their own movable points even in a crowded Galaxy', () => {
  const frame: DitherFrame = { width: 1000, height: 700, phase: 0, assets: Array.from({ length: 50 }, (_, i) => ({ id: 'planet-' + i, spec, x: 500, y: 300, radius: 80 })) }
  createDitherMotion().apply(frame, .02, 0, true, false)
  expect(frame.assets.every(a => (a.particles?.count ?? 0) >= 128)).toBe(true)
})

test('editing pixel size changes the raster immediately rather than reusing a stale grid', () => {
  const engine = createDitherMotion()
  const fine = { ...spec, overrides: { ...spec.overrides, pixelSize: 3 } }
  const frame: DitherFrame = { width: 500, height: 500, phase: 0, assets: [{ id: 'edit', spec: fine, x: 250, y: 250, radius: 120 }] }
  engine.apply(frame, 0, 0, false, false)
  expect(frame.assets[0].particles!.points[4]).toBeCloseTo(3)
  frame.assets[0].spec = { ...fine, overrides: { ...fine.overrides, pixelSize: 4 } }
  engine.apply(frame, 0, 0, false, false)
  expect(frame.assets[0].particles!.points[4]).toBeCloseTo(4)
})

test('quality downgrade and resizing transfer displacement and momentum to replacement cells', () => {
  const engine = createDitherMotion()
  const frame: DitherFrame = { width: 500, height: 500, phase: 0, pointer: { x: 280, y: 250 }, assets: [{ id: 'moving', spec, x: 250, y: 250, radius: 180 }] }
  for (let i = 0; i < 45; i++) engine.apply(frame, 1 / 60, i / 60, true, false)
  const before = frame.assets[0].particles!
  engine.apply(frame, 0, .75, false, true)
  const lower = frame.assets[0].particles! as ReturnType<typeof createDitherCellField>
  expect(lower !== before).toBe(true)
  expect(energy(lower) / lower.count).toBeGreaterThan(.001)
  expect(lower.velocities.some(v => Math.abs(v) > .01)).toBe(true)
  frame.assets[0].radius = 400
  engine.apply(frame, 0, .75, false, false)
  const resized = frame.assets[0].particles! as ReturnType<typeof createDitherCellField>
  expect(energy(resized) / resized.count).toBeGreaterThan(.001)
  expect(resized.velocities.some(v => Math.abs(v) > .01)).toBe(true)
})

test('idle Galaxy stars drift as well as twinkle, rather than being fixed image dots', () => {
  const field = createGalaxyBackdrop('drift')
  updateGalaxyBackdrop(field, 1000, 700, 0, 0, undefined, true)
  const start = field.points.slice()
  updateGalaxyBackdrop(field, 1000, 700, .02, 10, undefined, true)
  expect(Math.hypot(start[0] - field.points[0], start[1] - field.points[1])).toBeGreaterThan(1)
})

test('Galaxy is a full-viewport procedural flow and its pointer fades smoothly on leave', () => {
  const engine = createDitherMotion()
  const frame: DitherFrame = { width: 1000, height: 700, phase: 0, assets: [], ambience: 1, pointer: { x: 200, y: 350 } }
  engine.apply(frame, .02, 1, true, false)
  expect(frame.background!.clouds).toHaveLength(1)
  const cloud = frame.background!.clouds[0]
  expect(cloud.backgroundField).toBe(true)
  expect(cloud.radius * 1.2).toBeGreaterThanOrEqual(500)
  const start = cloud.pointerPower!
  frame.pointer = undefined
  engine.apply(frame, .02, 2, true, false)
  expect(frame.background!.clouds[0].phase).toBe(2)
  expect(frame.background!.clouds[0].pointerPower).toBeGreaterThan(0)
  expect(frame.background!.clouds[0].pointerPower).toBeLessThan(start)
  engine.apply(frame, .02, 2, false, false)
  const paused = frame.background!.clouds[0].pointerPower
  engine.apply(frame, .5, 2, false, false)
  expect(frame.background!.clouds[0].pointerPower).toBe(paused)
})
