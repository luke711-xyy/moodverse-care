// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'
import { buildDitherStageFrame } from '../src/music/dither/stage-layout'
import { hitTestDitherAssets } from '../src/music/dither/layout'
const capture = vi.hoisted(() => ({ frame: null as DitherFrame | null }))
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w: number, h: number, phase: number) => DitherFrame }) => { capture.frame = props.getFrame(1000, 700, 0); return <canvas /> } }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('rear satellites are painted and picked behind the owner; front satellites stay visible', () => {
  const frame = buildDitherStageFrame({ width: 1000, height: 700, phase: 0, owner: createDitherSpec({ planetId: 'owner', tracks: [], overrides: { form: 'particles', size: 1, pulse: 0, pointer: 'off' } }), systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [{ id: 'right' }, { id: 'front' }, { id: 'left' }, { id: 'rear' }] })
  const ownerIndex = frame.assets.findIndex(a => a.id.startsWith('home:'))
  const rearIndex = frame.assets.findIndex(a => a.id === 'music:rear')
  const frontIndex = frame.assets.findIndex(a => a.id === 'music:front')
  expect(rearIndex).toBeLessThan(ownerIndex)
  expect(frontIndex).toBeGreaterThan(ownerIndex)
  const rear = frame.assets[rearIndex], front = frame.assets[frontIndex]
  expect(hitTestDitherAssets(frame.assets, rear.x, rear.y)?.id).toMatch(/^home:/)
  expect(hitTestDitherAssets(frame.assets, front.x, front.y)?.id).toBe('music:front')
  expect(front.radius).toBeGreaterThan(rear.radius)
})

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
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.kind).toBe('nebula')
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

test('an open personal terminal cannot change the Galaxy exterior or its controls', () => {
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: true,
    productView: 'orbit', exteriorView: 'galaxy', galaxySystems: [], galaxyRotation: 0, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  render(<Stage {...props} />)
  expect(capture.frame!.assets.some(asset => asset.id.startsWith('home:'))).toBe(false)
  fireEvent.keyDown(screen.getByRole('region', { name: '二维音乐宇宙' }), { key: 'ArrowRight' })
  expect(props.onTourMove).toHaveBeenCalledWith(.15)
})
