import { expect, test } from 'vitest'

import { normalizeDoodleStroke } from '../src/doodle.ts'

test('normalized doodles keep their square-relative points and color', () => {
  const stroke = { points: [[.1, .2], [.9, .8]] as Array<[number, number]>, color: '#72cfff', width: .012, coordinateSpace: 'normalized' as const }

  expect(normalizeDoodleStroke(stroke)).toEqual(stroke)
})

test('older wide-canvas doodles are centered and fit the square surface', () => {
  const stroke = { points: [[0, 0], [360, 100]] as Array<[number, number]>, color: '#ffd36b', width: 2 }
  const normalized = normalizeDoodleStroke(stroke)

  expect(normalized.coordinateSpace).toBe('normalized')
  expect(normalized.points[0]).toEqual([0, 130 / 360])
  expect(normalized.points[1]).toEqual([1, 230 / 360])
  expect(normalized.width).toBeCloseTo(2 / 360)
})
