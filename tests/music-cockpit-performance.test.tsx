// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CrtScreen } from '../src/music/cockpit/CrtScreen'
import { useCockpitFlight } from '../src/music/cockpit/flight'

let now = 1000, nextId = 0, hidden = false
const frames = new Map<number, FrameRequestCallback>()
function advance(ms: number) {
  act(() => { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); vi.advanceTimersByTime(ms) })
}
beforeEach(() => {
  vi.useFakeTimers(); now = 1000; nextId = 0; hidden = false; frames.clear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++nextId, fn); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

test.each([false, true])('waiting for flight data stops state updates and resumes arrival (reduced=%s)', reduced => {
  const arrivals: number[] = []; let renders = 0
  const { result } = renderHook(() => { renders++; return useCockpitFlight(reduced, trip => arrivals.push(trip.token)) })
  act(() => result.current.start({ from: 'galaxy', to: 'home', ready: false, sourceVisitor: null, targetVisitor: null, returning: false }))
  for (let i = 0; i < 160; i++) advance(1000 / 60)
  expect(result.current.flight?.progress).toBe(.5)
  expect(frames.size).toBe(0)
  const heldRenders = renders
  for (let i = 0; i < 60; i++) advance(1000 / 60)
  expect(renders).toBe(heldRenders)
  act(() => result.current.ready(1))
  for (let i = 0; i < 100; i++) advance(1000 / 60)
  expect(result.current.flight).toBeNull(); expect(arrivals).toEqual([1])
})

test('high-refresh flight caps React updates and hidden-page suspension does not jump', () => {
  let renders = 0
  const { result, unmount } = renderHook(() => { renders++; return useCockpitFlight(false, () => {}) })
  act(() => result.current.start({ from: 'galaxy', to: 'home', ready: true, sourceVisitor: null, targetVisitor: null, returning: false }))
  const initial = renders
  for (let i = 0; i < 144; i++) advance(1000 / 144)
  expect(renders - initial).toBeLessThanOrEqual(62)
  expect(result.current.flight!.progress).toBeGreaterThan(.2)
  const progress = result.current.flight!.progress
  hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(0)
  advance(10000)
  expect(result.current.flight!.progress).toBe(progress)
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange')))
  advance(20)
  expect(result.current.flight!.progress).toBeGreaterThan(progress)
  expect(result.current.flight!.progress - progress).toBeLessThan(.02)
  unmount(); expect(frames.size).toBe(0)
})

test('CRT reuses bounded noise frames, shares them across screens, and stops hidden or disabled work', () => {
  const images: ImageData[] = []
  vi.stubGlobal('CanvasRenderingContext2D', class {})
  const context = {
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image: ImageData) => images.push(image),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const props = { active: true, motion: true, enabled: true, mini: true }
  const view = render(<><CrtScreen {...props}>A</CrtScreen><CrtScreen {...props}>B</CrtScreen></>)
  for (let i = 0; i < 180; i++) advance(1000 / 60)
  expect(images.length).toBeGreaterThan(100)
  expect(new Set(images).size).toBeLessThanOrEqual(8)
  // An old single, mutable image also fits the memory bound but still rewrites every pixel.
  const snapshots = new Map([...new Set(images)].map(image => [image, image.data.slice()]))
  const count = images.length
  for (let i = 0; i < 60; i++) advance(1000 / 60)
  expect(images.length).toBeGreaterThan(count)
  for (const [image, pixels] of snapshots) expect(image.data.every((value, index) => value === pixels[index])).toBe(true)
  const sample = images.at(-1)!.data
  expect(sample[3]).toBe(255)
  const bright = sample.filter((value, i) => i % 4 === 0 && value === 230).length / (120 * 70)
  expect(bright).toBeGreaterThan(.27); expect(bright).toBeLessThan(.33)
  hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange')))
  const hiddenCount = images.length; advance(1000)
  expect(images.length).toBe(hiddenCount)
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange')))
  advance(50); expect(images.length).toBeGreaterThan(hiddenCount)
  view.rerender(<CrtScreen {...props} enabled={false}>A</CrtScreen>)
  const disabledCount = images.length; advance(1000)
  expect(images.length).toBe(disabledCount)
  expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
