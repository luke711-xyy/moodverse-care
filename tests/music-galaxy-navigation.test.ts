import { expect, test } from 'vitest'
import { createGalaxyJourneyMotion, galaxyTourPosition, sampleGalaxyJourneyMotion } from '../src/music/galaxy-navigation'
import { TOUR_END } from '../src/universe'
test('axis and camera use the same fractional stop, excluding the separate home button', () => {
  for (const count of [1,2,7,40]) for (let i=0;i<count;i++) {
    const position=galaxyTourPosition(count===1?0:i/(count-1),count)
    expect(position.currentIndex).toBe(i)
    expect(position.systemIndex).toBeCloseTo(i)
    expect(position.axisProgress).toBeCloseTo(i/count)
  }
  expect(galaxyTourPosition(.51,7).currentIndex).toBe(3)
})

test('node routes accelerate, cruise at a fixed sector rate, brake, and arrive exactly in either direction', () => {
  const route = createGalaxyJourneyMotion(0, TOUR_END, 5)
  const sample = (time: number) => sampleGalaxyJourneyMotion(route, time)
  expect(sample(0)).toBe(0)
  expect(sample(route.durationMs)).toBe(TOUR_END)
  expect(sample(100)).toBeLessThan(TOUR_END * .02)
  expect(sample(200) - sample(150)).toBeGreaterThan(sample(100) - sample(50))
  expect(sample(700) - sample(600)).toBeCloseTo(sample(1200) - sample(1100))
  expect(sample(route.durationMs) - sample(route.durationMs - 100)).toBeCloseTo(sample(100))
  const short = createGalaxyJourneyMotion(0, TOUR_END / 4, 5)
  expect((sample(700) - sample(600)) * 4 / TOUR_END).toBeCloseTo(
    (sampleGalaxyJourneyMotion(short, 500) - sampleGalaxyJourneyMotion(short, 400)) * 4 / TOUR_END,
  )
  const reverse = createGalaxyJourneyMotion(TOUR_END, 0, 5)
  let last = TOUR_END
  for (let time = 0; time <= reverse.durationMs + 100; time += 100) {
    const current = sampleGalaxyJourneyMotion(reverse, time)
    expect(current).toBeLessThanOrEqual(last)
    expect(current).toBeGreaterThanOrEqual(0)
    last = current
  }
  expect(last).toBe(0)
})
