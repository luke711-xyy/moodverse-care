// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CdPicker, filterCdTracks } from '../src/music/CdPicker'
import type { MusicTrackSummary } from '../src/music-domain'

const tracks: MusicTrackSummary[] = Array.from({ length: 7 }, (_, i) => ({ id: `song-${i}`, title: `歌曲 ${i}`, artistId: `artist-${i}`,
  artistName: `艺人 ${i}`, genres: [i % 2 ? 'Jazz' : 'Electronic'], moodTags: [], versionLabel: '',
  coverUrl: i === 0 ? 'https://artwork.example/real-cover.jpg' : null, officialUrl: null, durationSeconds: 181,
  visualFeatures: i === 0 ? { source: 'curated', tempoBpm: 106 } : undefined }))
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function Picker({ min = 1, reducedMotion = true }: { min?: number; reducedMotion?: boolean }) {
  const [selected, setSelected] = useState(['song-0']), [query, setQuery] = useState(''), [primary, setPrimary] = useState('song-0')
  return <CdPicker tracks={tracks} selectedIds={selected} query={query} onQuery={setQuery} searchId="test-song-search" min={min}
    primaryId={primary} onPrimary={setPrimary} reducedMotion={reducedMotion} onToggle={id => {
      const next = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]
      setSelected(next); if (!next.includes(primary)) setPrimary(next[0])
    }} />
}

test('CD wheel/keyboard navigation shows sourced artwork and metadata, not invented BPM', () => {
  render(<Picker />)
  expect(screen.getAllByAltText('《歌曲 0》专辑封面')[0].getAttribute('src')).toBe(tracks[0].coverUrl)
  expect(screen.getByText('106 BPM')).toBeTruthy()
  const stage = screen.getByRole('group', { name: 'CD 曲库' })
  fireEvent.wheel(stage, { deltaY: 3, deltaMode: 1 })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  // A burst does not skip several CDs; a reverse keyboard action is immediate.
  fireEvent.wheel(stage, { deltaY: 600 })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  fireEvent.keyDown(stage, { key: 'ArrowLeft' })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 0')
  fireEvent.keyDown(stage, { key: 'End' })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 6')
  expect(screen.getByText('未提供')).toBeTruthy()
  expect(screen.getByRole('button', { name: '下一张 CD' }).disabled).toBe(true)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no results' } })
  expect(screen.getByRole('status').textContent).toContain('没有找到匹配曲目')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'JAZZ' } })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  expect(filterCdTracks(tracks, '艺人 4').map(track => track.id)).toEqual(['song-4'])
  // Searching must not hide or lose existing selections in the rack.
  expect(screen.getByRole('button', { name: '取消选择《歌曲 0》' })).toBeTruthy()
})

test('rack enforces five songs and one-song minimum, supports main melody and removal', () => {
  render(<Picker />)
  const next = screen.getByRole('button', { name: '下一张 CD' })
  for (let i = 1; i <= 4; i++) { fireEvent.click(next); fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' })) }
  expect(screen.getByText('5 / 5 首')).toBeTruthy()
  fireEvent.click(next)
  expect(screen.getByRole('button', { name: 'CD 架已满' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '歌曲 5 · 艺人 5' }))
  expect(screen.getByText('5 / 5 首')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：歌曲 4 · 艺人 4' }))
  expect(screen.getByRole('radio', { name: '星球主旋律：歌曲 4 · 艺人 4' }).checked).toBe(true)
  for (let i = 1; i <= 4; i++) fireEvent.click(screen.getByRole('button', { name: `取消选择《歌曲 ${i}》` }))
  expect(screen.getByRole('button', { name: '取消选择《歌曲 0》' }).disabled).toBe(true)
  expect(screen.getByRole('radio', { name: '星球主旋律：歌曲 0 · 艺人 0' }).checked).toBe(true)
})

test('reduced-motion selection is immediate and failed artwork has an honest fallback', () => {
  render(<Picker min={0} />)
  fireEvent.error(screen.getAllByAltText('《歌曲 0》专辑封面')[0])
  expect(screen.getAllByText('暂无封面').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '下一张 CD' }))
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  const rack = screen.getByRole('group', { name: '已选择的 CD 架' })
  expect(within(rack).getByRole('button', { name: '取消选择《歌曲 1》' })).toBeTruthy()
  expect(document.querySelector('.music-cd-flight')).toBeNull()
  fireEvent.click(within(rack).getByRole('button', { name: '取消选择《歌曲 1》' }))
  fireEvent.click(within(rack).getByRole('button', { name: '取消选择《歌曲 0》' }))
  expect(screen.getByText('0 / 5 首')).toBeTruthy()
})

test('selection flies along an arc to the actual rack CD, shrinks, then reveals the stored disc', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const rack = this.closest('.music-cd-rack')
    const [x,y,width,height] = this.classList.contains('music-cd-picker') ? [0,0,900,600] : rack ? [700,30,50,50] : [100,200,240,240]
    return { x,y,width,height,left:x,top:y,right:x+width,bottom:y+height,toJSON:()=>({}) }
  })
  let finish!: () => void
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ finished: new Promise<void>(resolve => { finish = resolve }), cancel }))
  // jsdom has no Web Animations API; verify our actual keyframes and lifecycle.
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable:true, value:animate })
  try {
    render(<Picker reducedMotion={false} />)
    fireEvent.click(screen.getByRole('button', { name: '下一张 CD' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
    const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(frames[0].transform).toBe('translate(220px,320px) scale(1) rotate(-12deg)')
    expect(frames[1].transform).toContain('11px') // A raised, curved midpoint.
    expect(frames[2].transform).toBe(`translate(725px,55px) scale(${50/240}) rotate(0deg)`)
    expect(timing.duration).toBe(680)
    expect(screen.getByRole('button', { name:'取消选择《歌曲 1》' }).dataset.arriving).toBe('true')
    await act(async () => { finish() })
    expect(document.querySelector('.music-cd-flight')).toBeNull()
    expect(screen.getByRole('button', { name:'取消选择《歌曲 1》' }).dataset.arriving).toBe('false')
    expect(cancel).toHaveBeenCalled()
  } finally { delete (HTMLElement.prototype as Partial<HTMLElement>).animate }
})
