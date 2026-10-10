// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { GalaxyAxisNode } from '../src/music/GalaxyAxisNode'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
test('a node only shimmers on a rare random draw and returns to steady light', () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const random = vi.spyOn(Math, 'random').mockReturnValue(.5)
  const { container, unmount } = render(<GalaxyAxisNode reducedMotion={false} />)
  const node = container.querySelector('svg')!
  act(() => vi.advanceTimersByTime(10500))
  expect(node.getAttribute('data-shimmer')).toBe('false')
  random.mockReturnValue(.1)
  act(() => vi.advanceTimersByTime(10500))
  expect(node.getAttribute('data-shimmer')).toBe('true')
  act(() => vi.advanceTimersByTime(900))
  expect(node.getAttribute('data-shimmer')).toBe('false')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
test('reduced motion disables shimmer and cancels an active pulse', () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(Math, 'random').mockReturnValue(.1)
  const { container, rerender } = render(<GalaxyAxisNode reducedMotion={false} />)
  act(() => vi.advanceTimersByTime(6900))
  expect(container.querySelector('svg')!.getAttribute('data-shimmer')).toBe('true')
  rerender(<GalaxyAxisNode reducedMotion />)
  expect(container.querySelector('svg')!.getAttribute('data-shimmer')).toBe('false')
  expect(vi.getTimerCount()).toBe(0)
})
