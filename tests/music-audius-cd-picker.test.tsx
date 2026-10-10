// @vitest-environment jsdom
import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AudiusCdPicker } from '../src/music/AudiusCdPicker'
import type { CdPickerProps } from '../src/music/CdPicker'
import type { MusicApi, MusicCatalogPage } from '../src/music-api'
import type { MusicTrackSummary } from '../src/music-domain'

// Expose the child contract: only browse IDs can enter the current page, while
// selected IDs must still resolve after the parent trims its catalog cache.
vi.mock('../src/music/CdPicker', () => ({ CdPicker: (props: CdPickerProps) => <>
  <input aria-label="搜索" value={props.query} onChange={event => props.onQuery(event.target.value)} />
  <button onClick={() => props.onGenre?.('Jazz')}>切换 Jazz</button>
  <div role="group" aria-label="当前页">{props.browseIds?.map(id => <button key={id} onClick={() => props.onToggle(id)}>{props.tracks.find(track => track.id === id)?.title ?? `缺失 ${id}`}</button>)}</div>
  <div role="group" aria-label="已选唱片">{props.selectedIds.map(id => <span key={id}>{props.tracks.find(track => track.id === id)?.title ?? `缺失 ${id}`}</span>)}</div>
  {props.hasMore && <button onClick={props.onMore}>旧版加载更多</button>}
</> }))

const track = (id: string): MusicTrackSummary => ({ id, title: `歌曲 ${id}`, artistId: 'artist', artistName: '艺人', genres: [], moodTags: [], versionLabel: '', coverUrl: null, officialUrl: null, durationSeconds: 120 })
const page = (prefix: string, count: number, nextOffset: number | null): MusicCatalogPage => ({ tracks: Array.from({ length: count }, (_, i) => track(`${prefix}-${i}`)), status: 'live', hasMore: nextOffset !== null, nextOffset })
function Harness({ api }: { api: MusicApi }) {
  const [tracks, setTracks] = useState([track('kept')]), [query, setQuery] = useState('')
  const [selected, setSelected] = useState(['kept'])
  return <AudiusCdPicker api={api} tracks={tracks} selectedIds={selected} onToggle={id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} query={query} onQuery={setQuery} searchId="catalog"
    onTracks={incoming => setTracks(current => [...incoming.slice(0, 24), ...current.filter(item => selected.includes(item.id))])} />
}
const flush = (milliseconds = 0) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

test('catalog replaces pages using provider cursor history and retains full page plus selected discs', async () => {
  const searchCatalog = vi.fn(async (_query: string, _genre: string, offset: number) => offset === 0 ? page('local', 50, 50) : offset === 50 ? page('provider', 24, 74) : page('last', 3, null))
  render(<Harness api={{ searchCatalog } as unknown as MusicApi} />)
  await flush()
  const current = screen.getByRole('group', { name: '当前页' })
  expect(within(current).getByText('歌曲 local-49')).toBeTruthy()
  expect(current.children).toHaveLength(50)
  fireEvent.click(within(current).getByRole('button', { name: '歌曲 local-49' }))
  expect(screen.queryByRole('button', { name: '旧版加载更多' })).toBeNull()
  for (const expected of ['provider', 'last']) {
    fireEvent.click(screen.getByRole('button', { name: '曲库下一页' })); await flush()
    expect(within(current).getByText(`歌曲 ${expected}-0`)).toBeTruthy()
    expect(within(current).queryByText('歌曲 local-0')).toBeNull()
    expect(screen.getByRole('group', { name: '已选唱片' }).textContent).toBe('歌曲 kept歌曲 local-49')
  }
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '曲库下一页' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '曲库上一页' })); await flush()
  expect(current.children).toHaveLength(24)
  fireEvent.click(screen.getByRole('button', { name: '曲库上一页' })); await flush()
  expect(current.children).toHaveLength(50)
  expect(searchCatalog.mock.calls.map(call => call[2])).toEqual([0, 50, 74, 50, 0])
})

test('search and genre start at page one and stale page requests cannot overwrite newer results', async () => {
  let resolveOld!: (value: MusicCatalogPage) => void
  const pending = new Promise<MusicCatalogPage>(resolve => { resolveOld = resolve })
  const searchCatalog = vi.fn((query: string, genre: string, offset: number) => offset === 24 ? pending : Promise.resolve(page(query || genre || 'initial', 2, 24)))
  render(<Harness api={{ searchCatalog } as unknown as MusicApi} />)
  await flush()
  fireEvent.click(screen.getByRole('button', { name: '曲库下一页' })); await flush()
  fireEvent.change(screen.getByRole('textbox', { name: '搜索' }), { target: { value: 'moon' } }); await flush(350)
  await act(async () => { resolveOld(page('stale', 24, 48)) })
  const current = screen.getByRole('group', { name: '当前页' })
  expect(within(current).getByText('歌曲 moon-0')).toBeTruthy()
  expect(within(current).queryByText('歌曲 stale-0')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '切换 Jazz' })); await flush(350)
  expect(searchCatalog.mock.calls.at(-1)?.slice(0, 3)).toEqual(['moon', 'Jazz', 0])
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '曲库上一页' }).disabled).toBe(true)
})

test('offline and rejected requests preserve the visible page and retry the failed cursor', async () => {
  const searchCatalog = vi.fn()
    .mockResolvedValueOnce(page('first', 24, 24))
    .mockResolvedValueOnce({ tracks: [], status: 'offline', hasMore: false, nextOffset: null })
    .mockRejectedValueOnce(new Error('temporary outage'))
    .mockResolvedValueOnce(page('recovered', 2, null))
  render(<Harness api={{ searchCatalog } as unknown as MusicApi} />)
  await flush()
  fireEvent.click(screen.getByRole('button', { name: '曲库下一页' })); await flush()
  const current = screen.getByRole('group', { name: '当前页' })
  expect(within(current).getByText('歌曲 first-0')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '曲库下一页' })); await flush()
  expect(within(current).getByText('歌曲 first-0')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' })); await flush()
  expect(within(current).getByText('歌曲 recovered-0')).toBeTruthy()
  expect(current.children).toHaveLength(2)
  expect(screen.getByRole('group', { name: '已选唱片' }).textContent).toBe('歌曲 kept')
  expect(searchCatalog.mock.calls.map(call => call[2])).toEqual([0, 24, 24, 24])
})
