// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'
const capture = vi.hoisted(() => ({ frame: null as DitherFrame | null }))
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w: number, h: number, phase: number) => DitherFrame }) => { capture.frame = props.getFrame(1000, 700, 0); return <canvas /> } }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('foreground nebula travel shrinks the owner to a point and grows it back on the reciprocal route', () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  let nextId = 0, now = 0
  const pending = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) act(() => { now += 50; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(now)) })
  }
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: false, productView: 'planet',
    galaxySystems: [], galaxyRotation: 0, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  const view = render(<Stage {...props} />)
  const initialRadius = capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius
  view.rerender(<Stage {...props} productView="galaxy" />)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBeCloseTo(initialRadius * .26875)
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.opacity).toBeCloseTo(.92)
  advance(21)
  expect(capture.frame!.assets.some(a => a.id.startsWith('home:') || a.id === 'nebula')).toBe(false)
  expect(screen.getByRole('region').dataset.traveling).toBe('false')
  now = 0
  view.rerender(<Stage {...props} />)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBeCloseTo(initialRadius * .26875)
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.opacity).toBeCloseTo(.92)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBe(initialRadius)
  expect(capture.frame!.assets.some(a => a.id === 'nebula')).toBe(false)
  expect(screen.getByRole('region').dataset.traveling).toBe('false')
})
test('own planet rotation still responds after returning from a focused galaxy', () => {
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: true, productView: 'planet',
    focusedGalaxy: 'previous', galaxySystems: [], galaxyRotation: 2, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  render(<Stage {...props} />)
  const initial = capture.frame!.assets[0].rotation
  fireEvent.keyDown(screen.getByRole('region', { name: '二维音乐宇宙' }), { key: 'ArrowRight' })
  expect(capture.frame!.assets[0].rotation).toBeCloseTo((initial ?? 0) + .15 * .25)
  expect(props.onRotate).not.toHaveBeenCalled()
})
