// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import MusicApp from '../src/music/MusicApp'
import { DEFAULT_AUDIO_URL, DEFAULT_TRACK_ID } from '../src/music/default-track'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('only a successful primary save changes background music, and reload restores the server primary after Cosmos is removed', async () => {
  const media: Array<HTMLAudioElement> = []
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    constructor(src = '') { super(); this.src = src; media.push(this as unknown as HTMLAudioElement) }
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {}
    removeAttribute() { this.src = '' }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const tracks = [
    { id: DEFAULT_TRACK_ID, title: 'Cosmos', artistName: 'The_mountain', audioUrl: DEFAULT_AUDIO_URL },
    { id: 'audius:real', title: '真实旋律', artistName: '真实艺人', audioUrl: '/api/music/tracks/audius%3Areal/stream' },
  ].map((track, i) => ({ ...track, artistId: `artist-${i}`, genres: ['Pop'], moodTags: [], versionLabel: '', officialUrl: null, coverUrl: null, durationSeconds: 100 }))
  let owner = { id: 'primary-owner', displayName: '我的测试星球', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: {}, tracks: tracks.map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '' })) }
  let failSave = true
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://test.invalid').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks, status: 'live', hasMore: false })
    if (path === '/api/me/music-planet') {
      if (init?.method === 'PATCH') {
        if (failSave) return Response.json({ error: 'FAILED' }, { status: 500 })
        const patch = JSON.parse(String(init.body))
        owner = { ...owner, tracks: tracks.filter(track => patch.trackIds.includes(track.id)).map((track, position) => ({ ...track, position, isPrimary: track.id === patch.primaryTrackId, selectedAt: '' })) }
      }
      return Response.json({ planet: owner, friendSatellites: [] })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    return Response.json({ groups: [], genres: ['Pop'], incoming: [], outgoing: [] })
  }))
  const view = render(<MusicApp />)
  await waitFor(() => expect(media.at(-1)?.src).toBe(DEFAULT_AUDIO_URL))
  fireEvent.click(await screen.findByRole('button', { name: '打开个人终端' }))
  fireEvent.click(await screen.findByRole('button', { name: '星球资料与歌曲' }))
  fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：真实旋律 · 真实艺人' }))
  fireEvent.click(screen.getByRole('button', { name: '取消选择《Cosmos》' }))
  expect(media.at(-1)?.src).toBe(DEFAULT_AUDIO_URL)
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))
  await screen.findByRole('alert')
  expect(media.at(-1)?.src).toBe(DEFAULT_AUDIO_URL)
  failSave = false
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))
  await waitFor(() => expect(media.at(-1)?.src).toBe('/api/music/tracks/audius%3Areal/stream'))
  expect(owner.tracks.map(track => track.id)).toEqual(['audius:real'])
  view.unmount()
  render(<MusicApp />)
  await waitFor(() => expect(media.at(-1)?.src).toBe('/api/music/tracks/audius%3Areal/stream'))
  expect(media.at(-1)?.paused).toBe(false)
})

test.each(['roam', 'collision', 'galaxy', 'orbit'])('%s arrival stays in the cockpit, clicking opens the profile, and music follows the visit', async entry => {
  const media: Array<HTMLAudioElement> = []
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0; readyState = 4
    constructor() { super(); media.push(this as unknown as HTMLAudioElement) }
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const song = (id: string, isPrimary = false) => ({ id, title: id, artistName: 'Artist', artistId: 'artist', genres: [], moodTags: [],
    versionLabel: '', officialUrl: null, coverUrl: null, durationSeconds: 200, audioUrl: `/api/music/tracks/${id}/stream`, isPrimary })
  const owner = { id: 'own', displayName: '我的星球', visibility: 'public', tracks: [song('own-song', true)] }
  const visitor = { id: 'other', displayName: '另一颗星球', visibility: 'public', tracks: [song('not-primary'), song('visitor-primary', true)], moments: [] }
  let finishVisit!: (response: Response) => void
  let failVisit = false
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://test.invalid').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks: [] })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner, friendSatellites: [] })
    if (path === '/api/me/friend-satellites') return Response.json({ friendSatellites: [] })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/music/discovery') return Response.json({ recommendations: [{ planetId: 'other', displayName: visitor.displayName, reasonCode: 'random', matchScore: 0 }], ranking: {} })
    if (path === '/api/music/song-portal') return Response.json({ trackId: 'own-song', matches: [{ planetId: 'other', displayName: visitor.displayName, matchSource: 'active_selection', reasonCode: 'shared_song_selection' }], ranking: {} })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [{ key: 'Pop', label: 'Pop', planetCount: 1, planets: [{ planetId: 'other', displayName: visitor.displayName, tagline: '', visibility: 'public', tracks: visitor.tracks }] }] })
    if (path === '/api/me/orbit') return Response.json({ groups: { friends: [], songEncounters: [], visitorsToMe: [], dailyRoam: [], visitedByMe: [{ planetId: 'other', displayName: visitor.displayName, canVisit: true }] } })
    if (path === '/api/music/planets/other/visit') return failVisit ? Response.json({ error: 'FAIL' }, { status: 500 }) : new Promise<Response>(resolve => { finishVisit = resolve })
    return Response.json({ groups: [], incoming: [], outgoing: [], friends: [] })
  })
  render(<MusicApp />)
  await waitFor(() => expect(media.at(-1)?.src).toBe('/api/music/tracks/own-song/stream'))
  media.at(-1)!.currentTime = 41
  if (entry === 'collision') {
    fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
    fireEvent.click(await screen.findByRole('button', { name: '寻找与《own-song》同歌的星球' }))
  } else if (entry === 'galaxy') {
    fireEvent.click(await screen.findByRole('button', { name: '场景星球：另一颗星球' }))
  } else fireEvent.click(screen.getByRole('button', { name: entry === 'orbit' ? 'Orbit' : '漫游', exact: true }))
  if (entry !== 'galaxy') fireEvent.click(await screen.findByRole('button', { name: entry === 'orbit' ? '再次访问' : '访问星球 另一颗星球' }))
  expect(media.at(-1)?.src).toBe('/api/music/tracks/own-song/stream')
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  await waitFor(() => expect(finishVisit).toBeTypeOf('function'))
  expect(media.at(-1)?.src).toBe('/api/music/tracks/own-song/stream')
  await act(async () => finishVisit(Response.json({ planet: visitor })))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy())
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('overview')
  expect(screen.queryByRole('heading', { name: '另一颗星球' })).toBeNull()
  expect(media.at(-1)?.src).toBe('/api/music/tracks/visitor-primary/stream')
  fireEvent.click(screen.getByRole('button', { name: '查看星球：另一颗星球' }))
  expect(await screen.findByRole('heading', { name: '另一颗星球' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  expect(media.at(-1)?.src).toBe('/api/music/tracks/visitor-primary/stream')
  fireEvent.click(screen.getByRole('button', { name: '查看星球：另一颗星球' }))
  fireEvent.click(screen.getByRole('button', { name: '返回出发地', exact: true }))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="galaxy"]:not(.is-in-flight)')).toBeTruthy())
  expect(media.at(-1)?.src).toBe('/api/music/tracks/own-song/stream')
  expect(media.at(-1)?.currentTime).toBe(41)
  expect(media.at(-1)?.paused).toBe(false)
  failVisit = true
  if (screen.queryByRole('button', { name: '返回驾驶舱' })) fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  fireEvent.click(screen.getByRole('button', { name: '漫游', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 另一颗星球' }))
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  await screen.findByRole('alert')
  expect(media.at(-1)?.src).toBe('/api/music/tracks/own-song/stream')
  expect(media.at(-1)?.currentTime).toBe(41)
})
