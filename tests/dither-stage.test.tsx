// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'
const capture = vi.hoisted(() => ({ frame: null as DitherFrame | null }))
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w: number, h: number, phase: number) => DitherFrame }) => { capture.frame = props.getFrame(1000, 700, 0); return <canvas /> } }))
afterEach(cleanup)
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
