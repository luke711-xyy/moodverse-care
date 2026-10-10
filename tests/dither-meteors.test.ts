import { afterEach, expect, test, vi } from 'vitest'
import { createDitherMotion } from '../src/music/dither/motion'
import type { DitherFrame } from '../src/music/dither/renderer'

afterEach(() => vi.restoreAllMocks())

test('background meteors remain sparse, randomized and bounded to two active streaks', () => {
  let seed = 12345
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  })
  const engine = createDitherMotion()
  const frame: DitherFrame = { width: 1000, height: 700, phase: 0, assets: [] }
  const counts = new Set<number>(), sizes = new Set<number>(), starts: number[] = []
  let empty = 0, wasEmpty = true
  for (let i = 0; i < 4000; i++) {
    engine.apply(frame, .05, i * .05, true, false)
    const meteors = frame.meteors!
    expect(meteors).toBeDefined()
    expect(meteors.activeCount).toBeLessThanOrEqual(2)
    counts.add(meteors.activeCount)
    if (!meteors.activeCount) empty++
    else {
      sizes.add(meteors.points[4])
      if (wasEmpty) starts.push(i * .05)
    }
    wasEmpty = meteors.activeCount === 0
  }
  expect([...counts].sort()).toEqual([0, 1, 2])
  expect(empty / 4000).toBeGreaterThan(.65)
  expect(sizes.size).toBeGreaterThan(5)
  const gaps = starts.slice(1).map((start, i) => start - starts[i])
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(9)
  expect(new Set(gaps.map(n => Math.round(n))).size).toBeGreaterThan(2)
})

test('paired meteors start on different top/right edges and move parallel down-left', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const engine = createDitherMotion()
  const frame: DitherFrame = { width: 1000, height: 700, phase: 0, assets: [] }
  for (let i = 0; i < 82; i++) engine.apply(frame, .05, i * .05, true, false)
  expect(frame.meteors?.activeCount).toBe(2)
  const first = frame.meteors!.points.slice()
  const stride = frame.meteors!.count / 2 * 6
  expect(first[1]).toBeLessThan(50)
  expect(first[stride]).toBeGreaterThan(950)
  engine.apply(frame, .05, 4.15, true, false)
  for (const offset of [0, stride]) {
    const points = frame.meteors!.points
    expect(points[offset]).toBeLessThan(first[offset])
    expect(points[offset + 1]).toBeGreaterThan(first[offset + 1])
    // Tail remains behind the head: upper-right, and fainter.
    expect(points[offset + 6]).toBeGreaterThan(points[offset])
    expect(points[offset + 7]).toBeLessThan(points[offset + 1])
    expect(points[offset + 5]).toBeGreaterThan(points[offset + 6 * 100 + 5])
  }
  engine.apply(frame, 100, 100, false, false)
  expect(frame.meteors?.activeCount).toBe(0)
  expect(frame.meteors?.count).toBe(0)
})
