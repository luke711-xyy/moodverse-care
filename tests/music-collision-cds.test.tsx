// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import { createDitherSpec } from '../src/music/dither/appearance'

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    constructor(src = '') { super(); this.src = src }
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {}
    removeAttribute() { this.src = '' }
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

test.each(['browse', 'own-song', 'planet-shortcut'])('collision searches and scrolls without collection writes: %s', async (entry) => {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('music-song-portal') ? 720 : 0
  })
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: function (options: ScrollToOptions) { this.scrollTop = options.top ?? 0 } })
  const tracks = ['夜航', '潮汐之间'].map((title, i) => ({ id: `song-${i}`, title, artistId: `artist-${i}`, artistName: `艺人 ${i}`,
    versionLabel: '', genres: ['ambient'], moodTags: [], officialUrl: `https://music.example/${i}`,
    coverUrl: `https://artwork.example/${i}.jpg`, durationSeconds: 180, position: i, isPrimary: i === 0, selectedAt: '' }))
  const owner = { id: 'collision-owner', displayName: '夜航者', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: createDitherSpec({ planetId: 'collision-owner', tracks }), tracks }
  const searches: string[] = [], writes: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://mosic.test')
    if (init?.method && init.method !== 'GET') writes.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: owner })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/music/song-portal') {
      searches.push(url.searchParams.get('trackId')!)
      return Response.json({ trackId: searches.at(-1), matches: [], ranking: { mode: 'rule', status: 'no_candidates' } })
    }
    return Response.json({ groups: [], incoming: [], outgoing: [], recommendations: [], ranking: { mode: 'rule', status: 'fallback' } })
  }))
  render(<MusicApp />)
  await waitFor(() => expect(document.querySelector('.music-app.has-planet')).toBeTruthy())
  if (entry !== 'browse') {
    if (entry === 'planet-shortcut') {
      fireEvent.click(screen.getByRole('button', { name: '跃迁' }))
      await waitFor(() => expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('home'))
    }
    fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
    if (entry === 'own-song') {
      fireEvent.click(screen.getByRole('button', { name: '寻找与《潮汐之间》同歌的星球' }))
    } else {
      fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
      fireEvent.click(screen.getByRole('button', { name: '撞歌', exact: true }))
    }
    await waitFor(() => expect(searches).toEqual([entry === 'own-song' ? 'song-1' : 'song-0']))
    expect(await screen.findByText('还没有找到可访问的同歌星球。可以从自己的其他歌曲继续探索。')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.cockpit-terminal-content')?.scrollTop).toBe(704))
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    return
  }
  fireEvent.click(await screen.findByRole('button', { name: '撞歌', exact: true }))
  const panel = within(await screen.findByRole('complementary', { name: '同歌搜索' }))
  expect(panel.getByRole('group', { name: '星球 CD' })).toBeTruthy()
  expect(panel.getAllByAltText('《夜航》专辑封面')[0].getAttribute('src')).toBe(tracks[0].coverUrl)
  expect(panel.queryByRole('group', { name: '已选择的 CD 架' })).toBeNull()
  fireEvent.click(panel.getByRole('button', { name: '下一张 CD' }))
  expect(panel.getByRole('heading', { name: '潮汐之间' })).toBeTruthy()
  expect(searches).toEqual([])
  fireEvent.click(panel.getByRole('button', { name: '撞歌 ↗' }))
  await waitFor(() => expect(searches).toEqual(['song-1']))
  expect(await panel.findByText('还没有找到可访问的同歌星球。可以从自己的其他歌曲继续探索。')).toBeTruthy()
  await waitFor(() => expect(document.querySelector('.cockpit-terminal-content')?.scrollTop).toBe(704))
  expect(window.scrollTo).not.toHaveBeenCalled()
  expect(writes).toEqual([])
})
