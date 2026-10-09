// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { DitherSurfaceDefinitions, INK_FILTER, SURFACE_FILTER } from '../src/music/cockpit/surface'

afterEach(cleanup)
test('hardware and ink dither RGB, never punch holes into source alpha', () => {
  const { container } = render(<DitherSurfaceDefinitions />)
  for (const id of [SURFACE_FILTER, INK_FILTER]) {
    const filter = container.querySelector(`#${id}`)!
    expect(filter.querySelectorAll('feComponentTransfer > *').length).toBe(3)
    expect(filter.querySelector('feFuncA, feConvolveMatrix, mask')).toBeNull()
    const last = filter.lastElementChild!
    expect(last.tagName).toBe('feComposite')
    expect(last.getAttribute('operator')).toBe('atop')
    expect(last.getAttribute('in2')).toBe('SourceGraphic')
  }
})
test('every pixel of the Bayer threshold tile is covered by an opaque color cell', () => {
  const { container } = render(<DitherSurfaceDefinitions />)
  const href = container.querySelector('feImage')!.getAttribute('href')!
  const tile = new DOMParser().parseFromString(decodeURIComponent(href.split(',')[1]), 'image/svg+xml')
  const cells = Array.from(tile.querySelectorAll('rect'))
  expect(cells).toHaveLength(64)
  const covered = new Set<string>()
  for (const cell of cells) {
    expect(cell.hasAttribute('opacity')).toBe(false)
    expect(cell.getAttribute('fill')).toMatch(/^rgb\(/)
    const x = Number(cell.getAttribute('x')), y = Number(cell.getAttribute('y'))
    expect(cell.getAttribute('width')).toBe('2'); expect(cell.getAttribute('height')).toBe('2')
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) covered.add(`${x+dx},${y+dy}`)
  }
  expect(covered.size).toBe(16*16)
})
