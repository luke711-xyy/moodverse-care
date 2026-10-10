// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useGalaxyJourney } from '../src/music/useGalaxyJourney'
import { TOUR_END } from '../src/universe'

let now = 1000, nextId = 0
const frames = new Map<number, FrameRequestCallback>()
function advance(milliseconds: number) {
  act(() => {
    now += milliseconds
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(now))
  })
}
beforeEach(() => {
  now = 1000; nextId = 0; frames.clear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('node animation progresses through the real journey; retargeting and manual input cancel the old route', () => {
  const { result, unmount } = renderHook(() => useGalaxyJourney(false, true))
  act(() => result.current.animateTo(TOUR_END, 5))
  expect(result.current.journey).toBe(0)
  advance(200)
  const middle = result.current.journey
  expect(middle).toBeGreaterThan(0)
  expect(middle).toBeLessThan(TOUR_END)
  expect(result.current.journeyRef.current).toBe(middle)
  act(() => result.current.animateTo(0, 5))
  expect(result.current.journey).toBe(middle)
  advance(200)
  expect(result.current.journey).toBeLessThan(middle)
  act(() => result.current.setJourney(.3))
  expect(frames.size).toBe(0)
  advance(3000)
  expect(result.current.journey).toBe(.3)
  act(() => result.current.animateTo(TOUR_END, 5))
  advance(10000)
  expect(result.current.journey).toBe(TOUR_END)
  expect(frames.size).toBe(0)
  act(() => result.current.animateTo(0, 5))
  unmount()
  expect(frames.size).toBe(0)
})

test('a far node reaches the actual camera coordinate within 1.2 seconds', () => {
  const { result } = renderHook(() => useGalaxyJourney(false, true))
  act(() => result.current.animateTo(TOUR_END, 40))
  advance(300)
  expect(result.current.journey).toBeGreaterThan(0)
  expect(result.current.journey).toBeLessThan(TOUR_END)
  advance(900)
  expect(result.current.journey).toBe(TOUR_END)
  expect(result.current.journeyRef.current).toBe(TOUR_END)
  expect(frames.size).toBe(0)
})

test('hidden tabs pause, leaving overview stops travel, and reduced motion skips camera movement', () => {
  const { result, rerender } = renderHook(({ reduced, enabled }) => useGalaxyJourney(reduced, enabled), { initialProps: { reduced: false, enabled: true } })
  act(() => result.current.animateTo(TOUR_END, 5))
  advance(200)
  const position = result.current.journey
  vi.mocked(Object.getOwnPropertyDescriptor(document, 'hidden')!.get!).mockReturnValue(true)
  advance(10000)
  expect(result.current.journey).toBe(position)
  vi.mocked(Object.getOwnPropertyDescriptor(document, 'hidden')!.get!).mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  advance(100)
  expect(result.current.journey).toBeGreaterThan(position)
  rerender({ reduced: false, enabled: false })
  const stopped = result.current.journey
  expect(frames.size).toBe(0)
  advance(10000)
  expect(result.current.journey).toBe(stopped)
  rerender({ reduced: true, enabled: true })
  act(() => result.current.animateTo(TOUR_END, 5))
  expect(result.current.journey).toBe(TOUR_END)
  expect(frames.size).toBe(0)
})
