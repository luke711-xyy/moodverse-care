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

test('node routes accelerate, cruise, brake, and arrive exactly in either direction', () => {
  const route = createGalaxyJourneyMotion(0, TOUR_END, 5)
  const sample = (time: number) => sampleGalaxyJourneyMotion(route, time)
  expect(sample(0)).toBe(0)
  expect(sample(route.durationMs)).toBe(TOUR_END)
  expect(sample(30)).toBeLessThan(TOUR_END * .01)
  expect(sample(120) - sample(90)).toBeGreaterThan(sample(60) - sample(30))
  expect(sample(route.durationMs * .5) - sample(route.durationMs * .4)).toBeCloseTo(sample(route.durationMs * .6) - sample(route.durationMs * .5))
  expect(sample(route.durationMs) - sample(route.durationMs - 30)).toBeCloseTo(sample(30))
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

test('distant node clicks gain speed instead of accumulating seconds per sector', () => {
  let previousSpeed = 0
  for (const stops of [1, 4, 9, 20, 39]) {
    const route = createGalaxyJourneyMotion(0, TOUR_END * stops / 39, 40)
    expect(route.durationMs).toBeLessThanOrEqual(1200)
    expect(route.durationMs).toBeGreaterThanOrEqual(350)
    if (stops === 1) expect(route.durationMs).toBeLessThanOrEqual(450)
    const cruiseSpeed = (sampleGalaxyJourneyMotion(route, route.durationMs * .6) - sampleGalaxyJourneyMotion(route, route.durationMs * .4)) / (route.durationMs * .2)
    expect(cruiseSpeed).toBeGreaterThan(previousSpeed)
    previousSpeed = cruiseSpeed
    expect(sampleGalaxyJourneyMotion(route, 1200)).toBe(route.to)
  }
})
