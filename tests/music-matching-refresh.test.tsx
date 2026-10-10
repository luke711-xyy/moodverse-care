// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import MusicApp from '../src/music/MusicApp'
import { createDitherSpec } from '../src/music/dither/appearance'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test.each(['collection', 'primary'] as const)('roam refreshes after a saved %s edit only when the full song set changed', async edit => {
  const tracks = ['夜航', '潮汐'].map((title, position) => ({
    id: `refresh-song-${position}`, title, artistId: 'artist', artistName: '艺人', versionLabel: '',
    genres: ['ambient'], moodTags: [], officialUrl: null, coverUrl: null, durationSeconds: 100,
    position, isPrimary: position === 0, selectedAt: '',
  }))
  let planet = { id: 'refresh-owner', displayName: '我的星球', tagline: '', visibility: 'public',
    visual: createDitherSpec({ planetId: 'refresh-owner', tracks }), tracks }
  let saved = false
  let failSave = true
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://music.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') {
      if (init?.method === 'PATCH') {
        if (failSave) return Response.json({ error: 'FAILED' }, { status: 500 })
        const patch = JSON.parse(String(init.body)) as { trackIds?: string[]; primaryTrackId?: string }
        planet = { ...planet, tracks: planet.tracks.filter(track => !patch.trackIds || patch.trackIds.includes(track.id))
          .map(track => ({ ...track, isPrimary: patch.primaryTrackId ? track.id === patch.primaryTrackId : track.isPrimary })) }
        saved = true
      }
      return Response.json({ planet, friendSatellites: [] })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/music/discovery') return Response.json({ ranking: { mode: 'stable_fallback', status: 'not_configured' },
      recommendations: [{ planetId: 'result', displayName: saved ? '新的歌曲推荐' : '原来的歌曲推荐', tagline: '', reasonCode: 'similar_genre', matchScore: 1 }] })
    return Response.json({ groups: [], incoming: [], outgoing: [], friends: [] })
  })
  const openRoam = () => {
    const back = screen.queryByRole('button', { name: '返回驾驶舱' })
    if (back) fireEvent.click(back)
    fireEvent.click(screen.getByRole('button', { name: '漫游', exact: true }))
  }
  const editSongs = async () => {
    fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
    fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
    fireEvent.click(await screen.findByRole('button', { name: '星球资料与歌曲' }))
    if (edit === 'collection') {
      const remove = screen.queryByRole('button', { name: '取消选择《潮汐》' })
      if (remove) fireEvent.click(remove)
    } else fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：潮汐 · 艺人' }))
  }
  render(<MusicApp />)
  await waitFor(() => expect(document.querySelector('.music-app.has-planet')).toBeTruthy())
  openRoam()
  await screen.findByRole('button', { name: '访问星球 原来的歌曲推荐' })
  await editSongs()
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))
  await screen.findByRole('alert')
  openRoam()
  await screen.findByRole('button', { name: '访问星球 原来的歌曲推荐' })
  await editSongs()
  failSave = false
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))
  await screen.findByText('星球资料与外观已保存。')
  openRoam()
  await screen.findByRole('button', { name: `访问星球 ${edit === 'collection' ? '新的歌曲推荐' : '原来的歌曲推荐'}` })
}, 20_000)
