import { expect, test } from 'vitest'
import { galaxyTourPosition } from '../src/music/galaxy-navigation'
test('axis and camera use the same fractional stop, excluding the separate home button', () => {
  for (const count of [1,2,7,40]) for (let i=0;i<count;i++) {
    const position=galaxyTourPosition(count===1?0:i/(count-1),count)
    expect(position.currentIndex).toBe(i)
    expect(position.systemIndex).toBeCloseTo(i)
    expect(position.axisProgress).toBeCloseTo(i/count)
  }
  expect(galaxyTourPosition(.51,7).currentIndex).toBe(3)
})
