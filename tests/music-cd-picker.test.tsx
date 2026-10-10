// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CdPicker, filterCdTracks } from '../src/music/CdPicker'
import { AudiusCdPicker } from '../src/music/AudiusCdPicker'
import type { MusicApi, MusicCatalogPage } from '../src/music-api'
import { SongWall } from '../src/music/dither/SongWall'
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

test('search and genre share the filter controls and both respect disabled selection', () => {
  const onGenre = vi.fn()
  const props = { tracks, selectedIds: [], onToggle: vi.fn(), query: '', onQuery: vi.fn(), searchId: 'filters', onGenre }
  const { rerender } = render(<CdPicker {...props} />)
  const filters = screen.getByRole('group', { name: '曲库筛选' })
  expect(within(filters).getByRole('searchbox')).toBeTruthy()
  fireEvent.change(within(filters).getByRole('combobox', { name: '浏览音乐曲风' }), { target: { value: 'Jazz' } })
  expect(onGenre).toHaveBeenCalledWith('Jazz')
  expect(filters.contains(screen.getByRole('group', { name: '已选择的 CD 架' }))).toBe(false)
  rerender(<CdPicker {...props} disabled />)
  expect(within(filters).getByRole<HTMLSelectElement>('combobox').disabled).toBe(true)
  expect(within(filters).getByRole<HTMLInputElement>('searchbox').disabled).toBe(true)
})

test('catalog feedback stays neutral through loading, cached results, failure and retry', async () => {
  let finish!: (value: MusicCatalogPage) => void
  const searchCatalog = vi.fn()
    .mockImplementationOnce(() => new Promise<MusicCatalogPage>(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ tracks: [], status: 'offline', hasMore: false, nextOffset: null })
    .mockResolvedValueOnce({ tracks: [tracks[1]], status: 'live', hasMore: false, nextOffset: null })
  const { container } = render(<AudiusCdPicker api={{ searchCatalog } as unknown as MusicApi} onTracks={() => {}}
    tracks={[]} selectedIds={[]} onToggle={() => {}} query="" onQuery={() => {}} searchId="neutral-catalog" reducedMotion />)
  expect(container.textContent).not.toMatch(/Audius|真实音乐|缓存曲库/i)
  expect(screen.getByText(/正在加载曲库/)).toBeTruthy()
  await waitFor(() => expect(searchCatalog).toHaveBeenCalledTimes(1))
  await act(async () => { finish({ tracks: [tracks[0]], status: 'cached', hasMore: true, nextOffset: 24 }) })
  expect(container.textContent).not.toMatch(/Audius|真实音乐|缓存曲库|正在加载曲库/i)
  fireEvent.click(screen.getByRole('button', { name: '曲库下一页' }))
  const retry = await screen.findByRole('button', { name: '重试' })
  expect(container.textContent).not.toMatch(/Audius|真实音乐|缓存曲库/i)
  expect(screen.getByText(/曲库暂时无法加载/)).toBeTruthy()
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 0')
  fireEvent.click(retry)
  await waitFor(() => expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1'))
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  expect(searchCatalog.mock.calls.map(call => call[2])).toEqual([0, 24, 24])
})

test('CD details keep in-app playback without official-platform links', () => {
  const record = { ...tracks[0], officialUrl: 'https://music.example/song', audioUrl: '/audio/song-0' }
  const toggle = vi.fn()
  render(<CdPicker tracks={[record]} selectedIds={[]} onToggle={() => {}} query="" onQuery={() => {}} searchId="no-external-links" player={{ playing: false, toggle }} />)
  expect(screen.queryByRole('link')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '播放 歌曲 0' }))
  expect(toggle).toHaveBeenCalledWith(record)
})

test('song wall never substitutes an external link for unavailable audio', () => {
  render(<SongWall tracks={[{ ...tracks[0], officialUrl: 'https://music.example/song' }]} onSelect={() => {}} />)
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByText(/不可播放/)).toBeTruthy()
})

test('CD wheel/keyboard navigation shows sourced artwork and metadata, not invented BPM', () => {
  // A burst is defined by event time, not how quickly the test host renders.
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  render(<Picker />)
  expect(screen.getAllByAltText('《歌曲 0》专辑封面')[0].getAttribute('src')).toBe(tracks[0].coverUrl)
  expect(screen.getByText('106 BPM')).toBeTruthy()
  const stage = screen.getByRole('group', { name: 'CD 曲库' })
  fireEvent.wheel(stage, { deltaY: -3, deltaMode: 1 })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  // A burst does not skip several CDs; a reverse keyboard action is immediate.
  fireEvent.wheel(stage, { deltaY: -600 })
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

test('opposite wheel directions move CDs backward and forward without changing keyboard direction', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
  render(<Picker />)
  const stage = screen.getByRole('group', { name: 'CD 曲库' })
  fireEvent.keyDown(stage, { key: 'ArrowRight' })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  fireEvent.wheel(stage, { deltaY: 120 })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 0')
  now.mockReturnValue(1400)
  fireEvent.wheel(stage, { deltaY: -120 })
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
})

test('catalog discs only browse; collection uses the add button and removal uses the rack', () => {
  render(<Picker min={0} />)
  const stage = screen.getByRole('group', { name: 'CD 曲库' })
  const rack = screen.getByRole('group', { name: '已选择的 CD 架' })
  fireEvent.click(within(stage).getByRole('button', { name: '歌曲 0 · 艺人 0' }))
  expect(within(rack).getByRole('button', { name: '取消选择《歌曲 0》' })).toBeTruthy()
  fireEvent.click(within(stage).getByRole('button', { name: '歌曲 1 · 艺人 1' }))
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 1')
  fireEvent.keyDown(stage, { key: 'Enter' })
  fireEvent.keyDown(stage, { key: ' ' })
  expect(within(rack).queryByRole('button', { name: '取消选择《歌曲 1》' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  expect(within(rack).getByRole('button', { name: '取消选择《歌曲 1》' })).toBeTruthy()
  fireEvent.click(within(stage).getByRole('button', { name: '歌曲 1 · 艺人 1' }))
  expect(screen.getByRole('button', { name: '已收入 CD 架' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: '从 CD 架取出' })).toBeNull()
  fireEvent.click(within(rack).getByRole('button', { name: '取消选择《歌曲 1》' }))
  expect(within(rack).queryByRole('button', { name: '取消选择《歌曲 1》' })).toBeNull()
  expect(screen.getByRole('button', { name: '+ 收入 CD 架' }).disabled).toBe(false)
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

test('long CD catalog renders only the seven-record carousel window', () => {
  const catalog = Array.from({ length: 100 }, (_, i) => ({ ...tracks[1], id: `large-${i}`, title: `曲目 ${i}` }))
  render(<CdPicker tracks={catalog} selectedIds={[]} query="" onQuery={() => {}} searchId="large-catalog" onToggle={() => {}} />)
  const stage = screen.getByRole('group', { name: 'CD 曲库' })
  for (let i = 0; i < 50; i++) fireEvent.keyDown(stage, { key: 'ArrowRight' })
  expect(within(stage).getAllByRole('button')).toHaveLength(7)
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('曲目 50')
})

test('visitor CD browsing preserves playback and matching without exposing selection controls', () => {
  const selected = vi.fn(), primary = vi.fn(), toggle = vi.fn(), find = vi.fn()
  const playable = tracks.slice(0,3).map(t=>({...t,audioUrl:`/audio/${t.id}`}))
  render(<CdPicker tracks={playable} selectedIds={[]} onToggle={selected} query="" onQuery={()=>{}} searchId="visitor"
    readOnly primaryId="song-1" onPrimary={primary} player={{playing:false,toggle}}
    canContinue={id=>id==='song-1'} onContinue={find} reducedMotion />)
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.queryByRole('radio')).toBeNull()
  expect(screen.queryByRole('button',{name:/收入 CD 架/})).toBeNull()
  const stage=screen.getByRole('group',{name:'星球 CD'})
  fireEvent.click(screen.getByRole('button',{name:'下一张 CD'}))
  expect(screen.getByText('星球主旋律')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'播放 歌曲 1'}))
  expect(toggle).toHaveBeenCalledWith(playable[1])
  fireEvent.click(screen.getByRole('button',{name:'继续寻找'}))
  expect(find).toHaveBeenCalledWith(playable[1])
  fireEvent.keyDown(stage,{key:'Enter'})
  fireEvent.click(screen.getByRole('button',{name:'歌曲 2 · 艺人 2'}))
  expect(document.querySelector('.music-cd-info h3')?.textContent).toBe('歌曲 2')
  expect(screen.queryByRole('button',{name:'继续寻找'})).toBeNull()
  expect(selected).not.toHaveBeenCalled(); expect(primary).not.toHaveBeenCalled()
})

test('visitor rack pages stay bounded and external selection reveals its page', () => {
  const catalog = Array.from({ length: 15 }, (_, i) => ({ ...tracks[1], id: `visitor-${i}`, title: `唱片 ${i}` }))
  const onSelect = vi.fn()
  const { rerender } = render(<SongWall tracks={catalog} selectedId="visitor-0" onSelect={onSelect} />)
  const rack = screen.getByRole('group', { name: '选择唱片' })
  expect(within(rack).getAllByRole('button')).toHaveLength(6)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  // Player updates may give the wall a new array with the same tracks.
  rerender(<SongWall tracks={[...catalog]} selectedId="visitor-0" onSelect={onSelect} />)
  expect(within(rack).queryByRole('button', { name: '查看唱片《唱片 0》' })).toBeNull()
  expect(document.querySelector('.music-focused-cd strong')?.textContent).toBe('唱片 0')
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(within(rack).getByRole('button', { name: '查看唱片《唱片 8》' }))
  expect(onSelect).toHaveBeenCalledWith('visitor-8')
  expect(document.querySelector('.music-focused-cd strong')?.textContent).toBe('唱片 8')
  rerender(<SongWall tracks={catalog} selectedId="visitor-14" onSelect={onSelect} />)
  expect(within(rack).getAllByRole('button')).toHaveLength(3)
  expect(within(rack).getByRole('button', { name: '查看唱片《唱片 14》' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '下一页' }).disabled).toBe(true)
  rerender(<SongWall tracks={catalog.slice(0, 2)} onSelect={onSelect} />)
  expect(within(rack).getAllByRole('button')).toHaveLength(2)
  expect(document.querySelector('.music-focused-cd strong')?.textContent).toBe('唱片 0')
})

test('song wall uses the actual artwork on CDs and keeps selection and playback connected', () => {
  const select = vi.fn(), toggle = vi.fn()
  const records = tracks.slice(0,2).map((track,i)=>({...track, coverUrl:`https://artwork.example/album-${i}.jpg`,audioUrl:`/audio/${track.id}`}))
  render(<SongWall tracks={records} selectedId="song-0" onSelect={select} player={{playing:false,toggle}} />)
  const first=screen.getByRole('button',{name:'查看唱片《歌曲 0》'})
  expect(within(first).getByAltText('《歌曲 0》专辑封面').getAttribute('src')).toBe('https://artwork.example/album-0.jpg')
  fireEvent.click(screen.getByRole('button',{name:'查看唱片《歌曲 1》'}))
  expect(select).toHaveBeenCalledWith('song-1')
  expect(document.querySelector('.music-focused-cd img')?.getAttribute('src')).toBe('https://artwork.example/album-1.jpg')
  fireEvent.click(screen.getByRole('button',{name:'播放 歌曲 1'}))
  expect(toggle).toHaveBeenCalledWith(records[1])
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
