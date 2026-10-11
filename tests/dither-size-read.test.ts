import { expect, test } from 'vitest'
import { readPlanetDitherVisuals } from '../functions/_music-dither'
import { createDitherSpec, effectiveDitherParameters } from '../src/music/dither/appearance'

test('public appearance reads apply current default sizes without querying or rewriting valid saved artwork', async () => {
  const rows = ['ordinary-owner', 'demo:planet:mist-route', 'demo:planet:glass-sea'].map(id => {
    const spec = createDitherSpec({ planetId: id, tracks: [], overrides: { motif: 'flower' } })
    return { id, visual_json: JSON.stringify({ ...spec, generated: { ...spec.generated, size: 1.3 } }) }
  })
  const before = JSON.stringify(rows)
  const env = { DB: { prepare() { throw new Error('Valid saved visuals must not trigger database reads or writes') } } } as unknown as Parameters<typeof readPlanetDitherVisuals>[0]
  const result = await readPlanetDitherVisuals(env, rows)
  expect(effectiveDitherParameters(result.get('ordinary-owner')!).size).toBe(1)
  const a = effectiveDitherParameters(result.get('demo:planet:mist-route')!).size
  const b = effectiveDitherParameters(result.get('demo:planet:glass-sea')!).size
  expect(a).toBeGreaterThanOrEqual(.85); expect(a).toBeLessThanOrEqual(1.15)
  expect(b).toBeGreaterThanOrEqual(.85); expect(b).toBeLessThanOrEqual(1.15)
  expect(a).not.toBe(b)
  expect(result.get('ordinary-owner')!.overrides.motif).toBe('flower')
  expect(JSON.stringify(rows)).toBe(before)
})
