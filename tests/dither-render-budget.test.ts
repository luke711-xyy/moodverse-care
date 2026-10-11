import { expect, test } from 'vitest'
import { createRenderBudget } from '../src/music/dither/render-budget'

test('startup hiccups do not trigger pacing; sustained overload does', () => {
  const budget = createRenderBudget()
  let now = 0
  for (; now <= 2000; now += 40) budget.sample(now, 28, 40)
  expect(budget.fps).toBe(60)
  for (; now <= 4500; now += 40) budget.sample(now, 28, 40)
  expect(budget.fps).toBe(30)
})
test('recovery needs sustained work and RAF headroom, not a single fast frame', () => {
  const budget = createRenderBudget()
  let now = 0
  for (; now < 5000; now += 40) budget.sample(now, 25, 40)
  for (let i = 0; i < 220; i++) { now += 34; budget.sample(now, 4, 34) }
  expect(budget.fps).toBe(30) // GPU/browser still cannot provide faster callbacks.
  for (let i = 0; i < 20; i++) { now += 34; budget.sample(now, 4, 16.7) }
  expect(budget.fps).toBe(30)
  for (let i = 0; i < 200; i++) { now += 34; budget.sample(now, 4, 16.7) }
  expect(budget.fps).toBe(60)
  budget.reset()
  expect(budget.fps).toBe(60)
})
