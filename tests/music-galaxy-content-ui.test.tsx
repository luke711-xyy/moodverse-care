// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GalaxyContent } from '../src/music/GalaxyContent'
import { GalaxyWindow } from '../src/music/GalaxyWindow'
import type { MusicGalaxyContent } from '../src/music-api'

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const track = { id: 'local:1', title: '夜航', artistId: 'artist:1', artistName: '星际旅人', versionLabel: '', genres: ['Ambient'], moodTags: [], officialUrl: null, coverUrl: null, durationSeconds: 100 }
const group = { key: 'artist:1', label: '星际旅人', planetCount: 0, planets: [] }

test('star terminal shares the CRT preference and preserves playback, closing and focus restoration', async () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
  const toggle = vi.fn(), close = vi.fn()
  const api = { loadGalaxyContent: async () => ({ ...page(), tracks: [{ ...track, audioUrl: '/audio/song' }] }) }
  const view = render(<GalaxyWindow api={api} by="artist" group={group} player={{ playing: false, toggle }} onClose={close} crtEnabled={false} reducedMotion />)
  await screen.findByText('艺人自己填写的简介')
  const dialog = screen.getByRole('dialog', { name: '星际旅人 星系' })
  expect(dialog.querySelector('.crt-screen')?.getAttribute('data-crt-enabled')).toBe('false')
  expect(dialog.querySelector('.crt-screen')?.getAttribute('data-crt-motion')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '播放 夜航' }))
  expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: track.id }))
  fireEvent.click(screen.getByRole('button', { name: '关闭星系窗口' }))
  expect(close).toHaveBeenCalledOnce()
  view.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove()
})

test('galaxy song details and related tracks have no external playback links', async () => {
  const record = { ...track, officialUrl: 'https://music.example/song', audioUrl: '/audio/song' }
  const api = { loadGalaxyContent: vi.fn(async () => ({ ...page(), by: 'song' as const, tracks: [record], relatedTracks: [{ ...track, id: 'related', title: '无音源歌曲', officialUrl: 'https://music.example/related' }] })) }
  const toggle = vi.fn()
  render(<GalaxyContent api={api} by="song" group={{ ...group, key: track.id }} player={{ playing: false, toggle }} />)
  await screen.findAllByText('无音源歌曲')
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(screen.getByText('暂无可用音源')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '播放 夜航' }))
  expect(toggle).toHaveBeenCalledWith(record)
})
function page(offset = 0): MusicGalaxyContent { return { by: 'artist', key: group.key, label: group.label, description: '艺人自己填写的简介', tracks: [{ ...track, id: String(offset), title: offset ? '另一首' : '夜航' }], hasMore: offset === 0, nextOffset: offset === 0 ? 10 : null, status: 'live' } }
test('artist description and server pagination replace, not accumulate, rendered tracks', async () => {
  const api = { loadGalaxyContent: vi.fn(async (_by, _key, offset) => page(offset)) }
  render(<GalaxyContent api={api} by="artist" group={group} player={{ playing: false, toggle: vi.fn() }} />)
  await screen.findByText('艺人自己填写的简介')
  expect(screen.getAllByText('夜航').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '星系歌曲 下一页' }))
  await screen.findAllByText('另一首')
  expect(screen.queryByText('夜航')).toBeNull()
  expect(api.loadGalaxyContent.mock.calls[1][2]).toBe(10)
  fireEvent.click(screen.getByRole('button', { name: '星系歌曲 上一页' }))
  await screen.findAllByText('夜航')
})
test('song grouping uses a CD face and never invents artist biography', async () => {
  const api = { loadGalaxyContent: vi.fn(async () => ({ ...page(), by: 'song' as const, description: null, hasMore: false, nextOffset: null,
    songDetails: { description: '夜晚录制的作品', bpm: 120, musicalKey: 'C major', tags: ['live'] }, relatedTracks: [{ ...track, id: 'other', title: '同艺人的另一首' }] })) }
  render(<GalaxyContent api={api} by="song" group={{ ...group, key: track.id }} player={{ playing: false, toggle: vi.fn() }} />)
  await screen.findAllByText('夜航')
  expect(document.querySelector('.music-galaxy-song .music-cd-disc')).toBeTruthy()
  expect(screen.queryByText('艺人自己填写的简介')).toBeNull()
  expect(screen.getByText('夜晚录制的作品')).toBeTruthy()
  expect(screen.getByText('120 BPM')).toBeTruthy()
  expect(screen.getAllByText('同艺人的另一首').length).toBeGreaterThan(0)
})
test('late response from a previous group cannot replace the newly selected star', async () => {
  let resolve!: (value: MusicGalaxyContent) => void
  const api = { loadGalaxyContent: vi.fn((_by, key) => key === 'old' ? new Promise<MusicGalaxyContent>(r => { resolve = r }) : Promise.resolve({ ...page(), label: '新艺人' })) }
  const view = render(<GalaxyContent api={api} by="artist" group={{ ...group, key: 'old' }} player={{ playing: false, toggle: vi.fn() }} />)
  view.rerender(<GalaxyContent api={api} by="artist" group={{ ...group, key: 'new' }} player={{ playing: false, toggle: vi.fn() }} />)
  await screen.findByRole('heading', { name: '新艺人' })
  resolve({ ...page(), label: '旧艺人' })
  await waitFor(() => expect(screen.queryByRole('heading', { name: '旧艺人' })).toBeNull())
})
