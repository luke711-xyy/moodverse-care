// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('changing appearance and pause state redraws without recreating GPU resources', () => {
  const { rerender } = render(<DitherCanvas getFrame={frame} />)
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  const next = (w: number, h: number, t: number) => ({ ...frame(w, h, t), assets: [{ ...frame(w, h, t).assets[0], radius: 90 }] })
  rerender(<DitherCanvas getFrame={next} reducedMotion />)
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  expect(dispose).not.toHaveBeenCalled()
  expect(draw.mock.calls.at(-1)?.[0].assets[0].radius).toBe(90)
})
test('hit detection receives the exact post-motion frame, not the unanimated layout', () => {
  const onFrame=vi.fn()
  render(<DitherCanvas getFrame={frame} onFrame={onFrame} />)
  const displayed=draw.mock.calls.at(-1)![0]
  expect(onFrame.mock.calls.at(-1)![0]).toBe(displayed)
  expect(displayed.assets[0].particles.count).toBeGreaterThan(0)
})

test('initial static preview still paints, unmount releases resources and frame callbacks', () => {
  const { unmount } = render(<DitherCanvas getFrame={frame} reducedMotion />)
  expect(draw).toHaveBeenCalled()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  unmount()
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalled()
})

test('a focused terminal pauses the covered world and resumes in place without a second GPU context', () => {
  const { rerender } = render(<DitherCanvas getFrame={frame} />)
  vi.mocked(requestAnimationFrame).mockClear()
  rerender(<DitherCanvas getFrame={frame} paused />)
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  rerender(<DitherCanvas getFrame={frame} />)
  expect(requestAnimationFrame).toHaveBeenCalled()
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  expect(dispose).not.toHaveBeenCalled()
})

test('portrait rotation preserves logical resolution and maps material interaction without reinitializing', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const { container } = render(<div style={{ '--music-viewport-rotation': '90' } as React.CSSProperties}><DitherCanvas getFrame={frame} paused /></div>)
  const canvas = container.querySelector('canvas')!
  Object.defineProperty(canvas,'clientWidth',{value:844})
  Object.defineProperty(canvas,'clientHeight',{value:390})
  canvas.getBoundingClientRect = () => ({left:0,top:0,right:390,width:390,height:844} as DOMRect)
  // jsdom doesn't inherit custom properties; set the same resolved value.
  canvas.style.setProperty('--music-viewport-rotation','90')
  fireEvent(window,new Event('resize'))
  fireEvent.pointerMove(canvas.parentElement!,{clientX:90,clientY:31})
  expect(draw.mock.calls.at(-1)?.[0].width).toBe(844)
  expect(draw.mock.calls.at(-1)?.[0].height).toBe(390)
  expect(draw.mock.calls.at(-1)?.[0].pointer).toEqual({x:31,y:300})
  expect(createDitherRenderer).toHaveBeenCalledTimes(1)
  expect(dispose).not.toHaveBeenCalled()
})

test('the slower orbit clock does not wrap before completing its revolution', () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  let pending: FrameRequestCallback | undefined, now = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending = callback; return 1 })
  const scenePhases: number[] = []
  const getFrame = (w: number, h: number, phase: number) => { scenePhases.push(phase); return frame(w, h, phase) }
  render(<DitherCanvas getFrame={getFrame} />)
  for (let i = 0; i < 800; i++) act(() => { now += 50; const callback = pending; pending = undefined; callback?.(now) })
  expect(Math.max(...scenePhases)).toBeGreaterThan(Math.PI * 2)
  // The shader's independent texture clocks still stay bounded and periodic.
  expect(draw.mock.calls.at(-1)?.[0].assets[0].phase).toBeLessThan(Math.PI * 2)
})
