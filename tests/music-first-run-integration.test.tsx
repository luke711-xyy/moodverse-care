// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import { createMusicApi } from '../src/music-api'

const seenKey = 'mosic-first-run-v1'
const tracks = ['甲', '乙', '丙'].map((title, i) => ({ id: `song-${i}`, title, artistId: `artist-${i}`, artistName: '音乐人', genres: ['Jazz'], moodTags: [], versionLabel: '', coverUrl: null, officialUrl: null, durationSeconds: 120 }))
const planet = { id: 'my-planet', displayName: '原来的星球', tagline: '', visibility: 'public', visualSchemaVersion: 3, visual: {}, tracks: tracks.map((track, position) => ({ ...track, position, isPrimary: !position, selectedAt: '' })), createdAt: '', updatedAt: '' }
function apiWithOwner(owner: unknown, owned?: Promise<Response>, writes: Array<{ path: string; body: any }> = []) {
  let currentOwner = owner
  let preferences = { genres: ['Jazz'], availableGenres: ['Jazz', 'Rock'], artists: [] as Array<{ id: string; label: string }>, songs: [] as Array<{ id: string; label: string }> }
  return createMusicApi(async (request, init) => {
    const path = new URL(String(request), 'https://test.local').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') {
      if (init?.method === 'POST') {
        const draft = JSON.parse(String(init.body))
        writes.push({ path, body: draft })
        currentOwner = { ...planet, displayName: draft.displayName, tagline: draft.tagline, visibility: draft.visibility }
        return Response.json({ planet: currentOwner }, { status: 201 })
      }
      return owned ?? Response.json({ planet: currentOwner, friendSatellites: [] })
    }
    if (path.endsWith('/moments')) return Response.json({ moments: [] })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [] })
    if (path === '/api/me/galaxy-preferences') {
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body))
        writes.push({ path, body: patch })
        preferences = { ...preferences, genres: patch.genres, artists: patch.artists.map((id: string) => ({ id, label: id })), songs: patch.songs.map((id: string) => ({ id, label: id })) }
      }
      return Response.json(preferences)
    }
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [], friends: [] })
    return Response.json({ error: 'NOT_IMPLEMENTED' }, { status: 404 })
  }, { liveSocial: false })
}
beforeEach(() => {
  localStorage.removeItem(seenKey)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
})
afterEach(() => { cleanup(); localStorage.removeItem(seenKey); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('the old seen-only marker does not count as a completed introduction', async () => {
  localStorage.setItem(seenKey, '1')
  const writes: Array<{ path: string; body: any }> = []
  render(<MusicApp apiOverride={apiWithOwner(null, undefined, writes)} />)
  expect(screen.getByRole('region', { name: 'MOSIC 首次调频' })).toBeTruthy()
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
  expect(screen.getByRole('button', { name: '开始调频' })).toBeTruthy()
  expect(localStorage.getItem(seenKey)).toBe('1')
  expect(writes).toEqual([])
})

test('an unfinished introduction restarts from welcome on re-entry, even with an existing planet', async () => {
  const writes: Array<{ path: string; body: any }> = []
  let resolve!: (response: Response) => void
  const pending = new Promise<Response>(done => { resolve = done })
  const first = render(<MusicApp apiOverride={apiWithOwner(planet, pending, writes)} />)
  await act(async () => { resolve(Response.json({ planet, friendSatellites: [] })) })
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
  expect(screen.getByRole('region', { name: 'MOSIC 首次调频' })).toBeTruthy()
  expect(screen.getByRole('img', { name: '原来的星球的已保存外观' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  await screen.findByRole('checkbox', { name: '偏好曲风 Jazz' })
  expect(localStorage.getItem(seenKey)).toBeNull()
  expect(writes).toEqual([])
  first.unmount()
  render(<MusicApp apiOverride={apiWithOwner(planet, undefined, writes)} />)
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
  expect(screen.getByRole('region', { name: 'MOSIC 首次调频' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '开始调频' })).toBeTruthy()
  expect(screen.getByRole('img', { name: '原来的星球的已保存外观' })).toBeTruthy()
  expect(writes).toEqual([])
})

test('a returning browser paints the cockpit overview while its personal signal is pending', async () => {
  localStorage.setItem(seenKey, 'completed')
  let resolve!: (response: Response) => void
  const pending = new Promise<Response>(done => { resolve = done })
  render(<MusicApp apiOverride={apiWithOwner(planet, pending)} />)
  expect(document.querySelector('.cockpit[data-focus="overview"]')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull()
  expect(screen.queryByText('正在读取星球')).toBeNull()
  expect(document.querySelector('.cockpit-terminal:not([hidden])')).toBeNull()
  await act(async () => { resolve(Response.json({ planet, friendSatellites: [] })) })
  await screen.findByText('原来的星球')
})

test('a new browser gets a skippable first tuning and a repeat visit bypasses it even without a planet', async () => {
  const first = render(<MusicApp apiOverride={apiWithOwner(null)} />)
  await screen.findByRole('region', { name: 'MOSIC 首次调频' })
  expect(localStorage.getItem(seenKey)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  expect(localStorage.getItem(seenKey)).toBe('completed')
  await waitFor(() => expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull())
  first.unmount()
  render(<MusicApp apiOverride={apiWithOwner(null)} />)
  expect(document.querySelector('.cockpit[data-focus="overview"]')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull()
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
  await screen.findByRole('button', { name: /生成我的星球/ })
})

test('closing an unfinished introduction without a planet does not suppress it next time', async () => {
  const first = render(<MusicApp apiOverride={apiWithOwner(null)} />)
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  await screen.findByRole('checkbox', { name: '偏好曲风 Jazz' })
  expect(localStorage.getItem(seenKey)).toBeNull()
  first.unmount()
  render(<MusicApp apiOverride={apiWithOwner(null)} />)
  expect(screen.getByRole('button', { name: '开始调频' })).toBeTruthy()
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
})

test('skipping is remembered even if the page closes before the television shutdown finishes', async () => {
  const first = render(<MusicApp apiOverride={apiWithOwner(planet)} />)
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  expect(localStorage.getItem(seenKey)).toBe('completed')
  expect(screen.getByRole('region', { name: 'MOSIC 首次调频' }).getAttribute('data-closing')).toBe('reduced')
  first.unmount()
  render(<MusicApp apiOverride={apiWithOwner(planet)} />)
  expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull()
  await screen.findByText('原来的星球')
})

test('blocked local storage does not prevent skipping or using the cockpit', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  render(<MusicApp apiOverride={apiWithOwner(null)} />)
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull())
  expect(document.querySelector('.cockpit[data-focus="overview"]')).toBeTruthy()
})

test('first tuning saves real preference and creation requests, then returns to the same saved planet', async () => {
  const writes: Array<{ path: string; body: any }> = []
  const api = apiWithOwner(null, undefined, writes)
  const first = render(<MusicApp apiOverride={api} />)
  fireEvent.click(await screen.findByRole('button', { name: '开始调频' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: '偏好曲风 Rock' }))
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 歌曲' }))
  fireEvent.click(screen.getByRole('button', { name: '保存偏好，继续' }))
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  expect(writes).toEqual([{ path: '/api/me/galaxy-preferences', body: { genres: ['Jazz', 'Rock'], artists: [], songs: [] } }])
  for (const track of tracks) {
    fireEvent.click(screen.getByRole('button', { name: `${track.title} · ${track.artistName}` }))
    fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  }
  fireEvent.click(screen.getByRole('button', { name: '三首已选，继续' }))
  fireEvent.change(screen.getByRole('textbox', { name: '星球名称' }), { target: { value: '新频率' } })
  fireEvent.click(screen.getByRole('radio', { name: '私密星球' }))
  fireEvent.click(screen.getByRole('button', { name: '点亮我的星球' }))
  await screen.findByRole('heading', { name: '新频率，已在这里' })
  expect(writes[1]).toEqual({ path: '/api/me/music-planet', body: { displayName: '新频率', tagline: '', visibility: 'private', trackIds: tracks.map(track => track.id) } })
  fireEvent.click(screen.getByRole('button', { name: '继续：撞歌教学' }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '完成教学，进入驾驶舱' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '撞歌 ↗' }))
  fireEvent.click(screen.getByRole('button', { name: '看看示例星球' }))
  expect(screen.getByRole('region', { name: 'MOSIC 首次调频' })).toBeTruthy()
  expect(writes).toHaveLength(2)
  expect(localStorage.getItem(seenKey)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '完成教学，进入驾驶舱' }))
  expect(localStorage.getItem(seenKey)).toBe('completed')
  await waitFor(() => expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull())
  expect(document.querySelector('.cockpit[data-focus="overview"]')).toBeTruthy()
  first.unmount()
  render(<MusicApp apiOverride={api} />)
  await screen.findByText('新频率')
  expect(screen.queryByRole('region', { name: 'MOSIC 首次调频' })).toBeNull()
  expect(writes).toHaveLength(2)
})
