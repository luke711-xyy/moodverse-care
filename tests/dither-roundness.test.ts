import { expect, test } from 'vitest'
import { DITHER_FORMS } from '../src/music/dither/appearance'
import { bodyRadius } from '../src/music/dither/sphere'
import { IDENTITY_ORIENTATION, type Orientation } from '../src/music/dither/arcball'

// Regression: rotating any form must not expose the old flattened depth axis.
// Check the entire rim, not just an axis-aligned bounding box that can conceal
// a diagonal ellipse. Texture, grain and organic rim detail remain independent.
test.each(DITHER_FORMS)('%s remains round through a full turn and freehand orientations', form => {
  const poses: Orientation[] = [IDENTITY_ORIENTATION,
    [Math.SQRT1_2, 0, 0, Math.SQRT1_2], [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    [.5, .5, .5, .5], [.3, .4, 0, Math.sqrt(.75)]]
  let worst = 1
  for (const orientation of poses) for (const pulse of [0, 1]) for (let step = 0; step < 24; step++) {
    const phase = step * Math.PI / 12
    const rim = Array.from({ length: 180 }, (_, i) => bodyRadius(form, i * Math.PI / 90, phase, pulse, orientation))
    worst = Math.min(worst, Math.min(...rim) / Math.max(...rim))
  }
  expect(worst).toBeGreaterThan(.9)
})
