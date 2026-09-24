import { expect, test } from 'vitest'

import { MOODS } from '../src/types.ts'

test('every mood has a distinct, luminous color token for dark surfaces', () => {
  const colors = MOODS.map((mood) => mood.color)

  expect(new Set(colors).size).toBe(MOODS.length)
  for (const color of colors) {
    expect(color).toMatch(/^oklch\(\.\d+ \.\d+ \d{1,3}\)$/)
    const lightness = Number(color.match(/^oklch\((\.\d+)/)?.[1])
    expect(lightness).toBeGreaterThanOrEqual(0.7)
  }
})
