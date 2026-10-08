// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DitherCanvas } from '../src/music/dither/DitherCanvas'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createDitherRenderer, type DitherFrame } from '../src/music/dither/renderer'

vi.mock('../src/music/dither/renderer', () => ({ createDitherRenderer: vi.fn() }))
const draw = vi.fn(), dispose = vi.fn(), cancel = vi.fn()
const spec = createDitherSpec({ planetId: 'lifecycle', tracks: [] })
const frame = (width: number, height: number, phase: number): DitherFrame => ({ width, height, phase, assets: [{ id: 'planet', spec, x: 100, y: 100, radius: 80 }] })
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React)
  vi.mocked(createDitherRenderer).mockReturnValue({ draw, dispose })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('changing appearance and pause state redraws without recreating GPU resources', () => {
  const { rerender } = render(<DitherCanvas getFrame={frame} />)
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  const next = (w: number, h: number, t: number) => ({ ...frame(w, h, t), assets: [{ ...frame(w, h, t).assets[0], radius: 90 }] })
  rerender(<DitherCanvas getFrame={next} reducedMotion />)
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  expect(dispose).not.toHaveBeenCalled()
  expect(draw.mock.calls.at(-1)?.[0].assets[0].radius).toBe(90)
})

test('initial static preview still paints, unmount releases resources and frame callbacks', () => {
  const { unmount } = render(<DitherCanvas getFrame={frame} reducedMotion />)
  expect(draw).toHaveBeenCalled()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  unmount()
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalled()
})
