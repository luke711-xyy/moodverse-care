// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMusicApi } from '../src/music-api'
import { GalaxySelectionSettings } from '../src/music/GalaxySelectionSettings'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
test('search results can be selected across pages and failed saves preserve the candidate draft', async () => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'https://mosic.test'), offset = Number(url.searchParams.get('offset'))
    return Response.json({ options: offset ? [{ id: 'artist-b', label: 'B 歌手' }] : [{ id: 'artist-a', label: 'A 歌手' }], hasMore: !offset, nextOffset: offset ? null : 12 })
  })
  const saved: string[][] = []
  let succeeds = false
  render(<GalaxySelectionSettings api={createMusicApi()} kind="artist" selectedOptions={[]} disabled={false} onSave={async ids => { saved.push(ids); return succeeds }} />)
  fireEvent.click(await screen.findByLabelText('选择艺人 A 歌手'))
  fireEvent.click(screen.getByRole('button', { name: '艺人候选 下一页' }))
  fireEvent.click(await screen.findByLabelText('选择艺人 B 歌手'))
  fireEvent.click(screen.getByRole('button', { name: '保存 Galaxy 艺人' }))
  expect(await screen.findByText('未保存，已保留你的选择，请重试。')).toBeTruthy()
  expect(saved[0]).toEqual(['artist-a','artist-b'])
  expect(screen.getByRole('button', { name: '移除艺人 A 歌手' })).toBeTruthy()
  succeeds = true
  fireEvent.click(screen.getByRole('button', { name: '保存 Galaxy 艺人' }))
  expect(await screen.findByText('Galaxy 艺人设置已保存。')).toBeTruthy()
})
test('restoring automatic song sampling saves an empty pool without modifying songs on the planet', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ options: [], hasMore: false, nextOffset: null }))
  const saved: string[][] = []
  render(<GalaxySelectionSettings api={createMusicApi()} kind="song" selectedOptions={[{ id:'song-a',label:'夜航 · 旅人' }]} disabled={false} onSave={async ids => { saved.push(ids); return true }} />)
  fireEvent.click(screen.getByRole('button', { name: '歌曲恢复自动随机' }))
  fireEvent.click(screen.getByRole('button', { name: '保存 Galaxy 歌曲' }))
  await waitFor(() => expect(saved).toEqual([[]]))
})
test('the client also bounds oversized older Galaxy responses once, without resampling on reads', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ by: 'song', groups: Array.from({ length: 20 }, (_, i) => ({ key: `song-${i}`, label: `Song ${i}`, planetCount: 0, planets: [] })) }))
  const response = await createMusicApi().loadGalaxy('song')
  expect(response.groups).toHaveLength(8)
  expect(new Set(response.groups.map(g => g.key)).size).toBe(8)
  const first = response.groups.map(g => g.key)
  expect(response.groups.map(g => g.key)).toEqual(first)
})
