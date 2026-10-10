// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppearanceEditor } from '../src/music/dither/AppearanceEditor'
import { createDitherSpec, type DitherPlanetSpec, type DitherOverrides } from '../src/music/dither/appearance'
import { sampleDitherPixel } from '../src/music/dither/sampler'
import type { MusicTrackSummary } from '../src/music-domain'

afterEach(cleanup)
const tracks: MusicTrackSummary[] = Array.from({ length: 5 }, (_, i) => ({ id: `song-${i}`, title: `歌曲 ${i}`, artistId: 'artist', artistName: '艺人', genres: [], moodTags: [], versionLabel: '', officialUrl: null, durationSeconds: null, coverUrl: i === 4 ? null : `https://example.com/cover-${i}.jpg` }))

test('appearance picker previews any available selected cover, disables missing art, and applies the choice', () => {
  let preview: DitherPlanetSpec | undefined, saved: DitherOverrides | undefined
  render(<AppearanceEditor embedded active={false} tracks={tracks} spec={createDitherSpec({ planetId: 'p', tracks })} busy={false} error="" onPreview={value => { preview = value }} onApply={value => { saved = value }} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '使用《歌曲 3》封面' }))
  expect(preview?.coverTexture?.url).toBe('https://example.com/cover-3.jpg')
  expect(screen.getByRole('button', { name: '使用《歌曲 4》封面' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '应用外观' }))
  expect(saved?.coverTrackId).toBe('song-3')
  fireEvent.click(screen.getByRole('button', { name: '默认纹理' }))
  expect(preview?.coverTexture).toBeUndefined()
})

test('fallback renderer uses cover colors instead of the pink blue palette', () => {
  const spec = createDitherSpec({ planetId: 'p', tracks, overrides: { coverTrackId: 'song-0' } })
  const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([0, 255, 0, 255]) }
  const [r, g, b, a] = sampleDitherPixel(spec, 0, 0, 0, 0, 0, 'planet', 0, pixels)
  expect(g).toBeGreaterThan(150)
  expect(r).toBeLessThan(80)
  expect(b).toBeLessThan(80)
  expect(a).toBe(255)
})
