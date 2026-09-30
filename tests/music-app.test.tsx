// @vitest-environment jsdom
import React, { createElement } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'

vi.mock('../src/scene', () => ({
  UniverseCanvas: () => createElement('div', { 'aria-label': '星球 3D 场景' }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const tracks = [
  { id: 'song-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '', genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215 },
  { id: 'song-b', title: '潮汐之间', artistId: 'artist-b', artistName: '潮汐', versionLabel: '', genres: ['indie'], moodTags: ['reflective'], officialUrl: 'https://music.example/b', coverUrl: null, durationSeconds: 203 },
  { id: 'song-c', title: '雾灯', artistId: 'artist-c', artistName: '雨季', versionLabel: '', genres: ['dream pop'], moodTags: ['hopeful'], officialUrl: 'https://music.example/c', coverUrl: null, durationSeconds: 198 },
  { id: 'song-d', title: '远岸', artistId: 'artist-d', artistName: '远岸', versionLabel: '', genres: ['folk'], moodTags: ['warm'], officialUrl: 'https://music.example/d', coverUrl: null, durationSeconds: 180 },
  { id: 'song-e', title: '月面信号', artistId: 'artist-e', artistName: '月面', versionLabel: '', genres: ['electronic'], moodTags: ['curious'], officialUrl: 'https://music.example/e', coverUrl: null, durationSeconds: 190 },
]

test('a new user can choose exactly three songs, create a public planet and see the AI-composed world', async () => {
  let createdPayload: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && !init?.method) return Response.json({ planet: null })
    if (path === '/api/me/music-planet' && init?.method === 'POST') {
      createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>
      return Response.json({
        planet: {
          id: 'planet-a', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public',
          visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
          tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
        },
        compositionTask: { id: 'task-a', status: 'queued' },
      }, { status: 201 })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/music-planet/ai-tasks/task-a') return Response.json({ task: {
      id: 'task-a', kind: 'planet_composer', status: 'succeeded', model: { name: 'qwen-local', version: '4b-q4' },
      result: { schemaVersion: 1, summary: '被三首歌照亮的星球。', palette: { surface: '#8d4772', ocean: '#071529', accent: '#8edfc9' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .42 },
      errorCode: null,
    } })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.change(screen.getByLabelText('星球名称'), { target: { value: '夜航者' } })
  fireEvent.change(screen.getByLabelText('一句星球简介（可选）'), { target: { value: '慢慢靠岸' } })

  fireEvent.click(screen.getByRole('button', { name: '夜航 · 星际旅人' }))
  fireEvent.click(screen.getByRole('button', { name: '潮汐之间 · 潮汐' }))
  fireEvent.click(screen.getByRole('button', { name: '雾灯 · 雨季' }))
  expect((screen.getByRole('button', { name: '远岸 · 远岸' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '生成我的星球' }))

  expect(await screen.findByRole('heading', { name: /夜航者/ })).toBeTruthy()
  expect(await screen.findByText('被三首歌照亮的星球。')).toBeTruthy()
  expect(screen.getByRole('link', { name: '夜航 · 星际旅人 · 在官方平台打开' }).getAttribute('href')).toBe('https://music.example/a')
  expect(createdPayload).toEqual({ displayName: '夜航者', tagline: '慢慢靠岸', trackIds: ['song-a', 'song-b', 'song-c'], visibility: 'public' })
})

test('clearly labels a configured demo account after normal email-session loading', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: null, isDemoAccount: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  expect(await screen.findByRole('heading', { name: '为你的星球选三首歌' })).toBeTruthy()
  expect(screen.getByText('演示账号')).toBeTruthy()
  expect(screen.getByText('邮箱已验证')).toBeTruthy()
})

test('an API 401 presents email OTP login and completes login before loading the private planet', async () => {
  let authenticated = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/auth/email/request') return Response.json({ ok: true })
    if (path === '/api/auth/email/verify') {
      authenticated = true
      return Response.json({ authenticated: true, email: 'luna@example.com' })
    }
    if (path === '/api/me/music-planet' && authenticated) return Response.json({ planet: null })
    if (path === '/api/me/music-planet/moments' && authenticated) return Response.json({ moments: [] })
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  }))

  render(<MusicApp />)
  expect(await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })).toBeTruthy()
  expect(screen.getByLabelText('邮箱地址')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'luna@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
  expect(await screen.findByText(/如果邮箱有效，验证码已发送/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('六位验证码'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: '验证并进入 Moodverse' }))
  expect(await screen.findByRole('heading', { name: '为你的星球选三首歌' })).toBeTruthy()
})

test('logout and a different email login clear the previous account private Orbit conversation', async () => {
  let authenticated = true
  let activeEmail = 'first@example.com'
  const privatePlanet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/auth/email/request') return Response.json({ ok: true })
    if (url.pathname === '/api/auth/email/verify') {
      activeEmail = (JSON.parse(String(init?.body)) as { email: string }).email
      authenticated = true
      return Response.json({ authenticated: true, email: activeEmail })
    }
    if (url.pathname === '/api/auth/logout') {
      authenticated = false
      return Response.json({ ok: true })
    }
    if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: activeEmail === 'first@example.com' ? privatePlanet : null })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: activeEmail === 'first@example.com' ? [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (url.pathname === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: activeEmail === 'first@example.com'
      ? [{ id: 'private-first', contentText: '只属于第一个账号的私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false }]
      : [] })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('只属于第一个账号的私信。')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })
  fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'second@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
  await screen.findByText(/如果邮箱有效，验证码已发送/)
  fireEvent.change(screen.getByLabelText('六位验证码'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: '验证并进入 Moodverse' }))

  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  expect(screen.queryByText('只属于第一个账号的私信。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  await screen.findByRole('heading', { name: 'My Orbit' })
  expect(screen.queryByText('第一位好友')).toBeNull()
  expect(screen.queryByLabelText('私信记录')).toBeNull()
})

test('an auth change from another tab clears this tab and reloads the shared session', async () => {
  vi.stubGlobal('BroadcastChannel', undefined)
  let authenticated = true
  let activeEmail = 'first@example.com'
  const planet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (path === '/api/me/music-planet') return Response.json({ planet: activeEmail === 'first@example.com' ? planet : null })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: activeEmail === 'first@example.com' ? [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: [
      { id: 'private-first', contentText: '另一个标签页里缓存的私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('另一个标签页里缓存的私信。')).toBeTruthy()

  authenticated = false
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify({ type: 'session-changed', sourceId: 'other-tab', eventId: 'logout-event' }) }))
  await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })
  expect(screen.queryByText('另一个标签页里缓存的私信。')).toBeNull()

  activeEmail = 'second@example.com'
  authenticated = true
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify({ type: 'session-changed', sourceId: 'other-tab', eventId: 'login-event' }) }))
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  await screen.findByRole('heading', { name: 'My Orbit' })
  expect(screen.queryByText('第一位好友')).toBeNull()
  expect(screen.queryByLabelText('私信记录')).toBeNull()
})

test('BroadcastChannel and storage notifications deduplicate, publish, and ignore this tab own event', async () => {
  class FakeBroadcastChannel extends EventTarget {
    static openChannels = new Set<FakeBroadcastChannel>()
    static messages: unknown[] = []
    constructor(readonly name: string) {
      super()
      FakeBroadcastChannel.openChannels.add(this)
    }
    postMessage(data: unknown) {
      FakeBroadcastChannel.messages.push(data)
      for (const channel of FakeBroadcastChannel.openChannels) {
        if (channel !== this && channel.name === this.name) channel.dispatchEvent(new MessageEvent('message', { data }))
      }
    }
    close() { FakeBroadcastChannel.openChannels.delete(this) }
    static fromOtherTab(data: unknown) {
      const sender = new FakeBroadcastChannel('moodverse-music-auth')
      sender.postMessage(data)
      sender.close()
    }
  }
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  let authenticated = true
  let activeEmail = 'first@example.com'
  let privatePlanetReads = 0
  const planet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') {
      privatePlanetReads += 1
      if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
      return Response.json({ planet: activeEmail === 'first@example.com' ? planet : null })
    }
    if (path === '/api/auth/logout') {
      authenticated = false
      return Response.json({ ok: true })
    }
    if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: activeEmail === 'first@example.com' ? [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: [
      { id: 'private-first', contentText: '广播通道中的旧私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('广播通道中的旧私信。')).toBeTruthy()

  authenticated = false
  const logoutEvent = { type: 'session-changed', sourceId: 'remote-tab', eventId: 'remote-logout-1' }
  // Simulate a sender whose BroadcastChannel is unavailable while this tab's is active.
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify(logoutEvent) }))
  await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })
  await waitFor(() => expect(privatePlanetReads).toBe(2))
  expect(screen.queryByText('广播通道中的旧私信。')).toBeNull()

  activeEmail = 'second@example.com'
  authenticated = true
  const loginEvent = { type: 'session-changed', sourceId: 'remote-tab', eventId: 'remote-login-1' }
  FakeBroadcastChannel.fromOtherTab(loginEvent)
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify(loginEvent) }))
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await waitFor(() => expect(privatePlanetReads).toBe(3))

  const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })
  await waitFor(() => expect(privatePlanetReads).toBe(4))
  const ownChannelEvent = [...FakeBroadcastChannel.messages].reverse().find((message): message is { type: string; sourceId: string; eventId: string } =>
    typeof message === 'object' && message !== null && 'type' in message && message.type === 'session-changed' && 'sourceId' in message && message.sourceId !== 'remote-tab' && 'eventId' in message,
  )
  const ownStorageCall = [...storageSpy.mock.calls].reverse().find(([key]) => key === 'moodverse-music-auth-change')
  expect(ownChannelEvent).toBeDefined()
  expect(ownStorageCall).toBeDefined()
  expect(JSON.parse(ownStorageCall?.[1] ?? '{}')).toEqual(ownChannelEvent)
  expect(screen.queryByText('广播通道中的旧私信。')).toBeNull()
})

test('an empty catalog explains that the controlled catalog must be populated before planet creation', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    return path === '/api/music/catalog' ? Response.json({ tracks: [] }) : Response.json({ planet: null })
  }))

  render(<MusicApp />)
  expect(await screen.findByText('曲库还没有可选歌曲')).toBeTruthy()
  expect(screen.getByText(/添加曲目后，你就可以开始创建星球/)).toBeTruthy()
})

test('settings load server privacy preferences and only show confirmed planet and Moment visibility changes', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着三首歌长成。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const moment = {
    id: 'moment/a', trackId: 'song-a', track: tracks[0], contentText: '今天想起这首歌。', photoUrl: null,
    visibility: 'public' as const, publishedAt: '2026-09-29T10:00:00.000Z',
    createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
  }
  const state = {
    planet: ownerPlanet,
    moment,
    social: { allowFriendRequests: false, allowDriftBottles: true },
    failNextPlanetPatch: false,
    requests: [] as Array<{ path: string; method?: string; body?: unknown }>,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    const path = url.pathname
    state.requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && init?.method === 'PATCH') {
      if (state.failNextPlanetPatch) {
        state.failNextPlanetPatch = false
        return Response.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 })
      }
      state.planet = { ...state.planet, visibility: (JSON.parse(String(init.body)) as { visibility: 'public' | 'private' }).visibility }
      return Response.json({ planet: state.planet })
    }
    if (path === '/api/me/music-planet') return Response.json({ planet: state.planet })
    if (path === '/api/me/music-planet/moments/moment%2Fa' && init?.method === 'PATCH') {
      state.moment = { ...state.moment, visibility: (JSON.parse(String(init.body)) as { visibility: 'public' | 'private' }).visibility }
      return Response.json({ moment: state.moment })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [state.moment] })
    if (path === '/api/me/social-settings' && init?.method === 'PATCH') {
      state.social = { ...state.social, ...JSON.parse(String(init.body)) as typeof state.social }
      return Response.json(state.social)
    }
    if (path === '/api/me/social-settings') return Response.json(state.social)
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('button', { name: '我的星球' })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '账户与隐私设置' })

  const friendRequests = screen.getByRole('checkbox', { name: /接收好友请求/ }) as HTMLInputElement
  const driftBottles = screen.getByRole('checkbox', { name: /接收漂流瓶/ }) as HTMLInputElement
  const planetVisibility = screen.getByRole('checkbox', { name: /允许在 Galaxy 中访问/ }) as HTMLInputElement
  const momentVisibility = screen.getByRole('checkbox', { name: /公开 Moment：夜航/ }) as HTMLInputElement
  expect(friendRequests.checked).toBe(false)
  expect(driftBottles.checked).toBe(true)
  expect(planetVisibility.checked).toBe(true)
  expect(momentVisibility.checked).toBe(true)

  fireEvent.click(friendRequests)
  await waitFor(() => expect(friendRequests.checked).toBe(true))
  fireEvent.click(driftBottles)
  await waitFor(() => expect(driftBottles.checked).toBe(false))
  fireEvent.click(planetVisibility)
  await waitFor(() => expect(planetVisibility.checked).toBe(false))
  fireEvent.click(momentVisibility)
  await waitFor(() => expect(momentVisibility.checked).toBe(false))
  expect(state.requests).toContainEqual({ path: '/api/me/social-settings', method: 'PATCH', body: { allowFriendRequests: true } })
  expect(state.requests).toContainEqual({ path: '/api/me/social-settings', method: 'PATCH', body: { allowDriftBottles: false } })
  expect(state.requests).toContainEqual({ path: '/api/me/music-planet', method: 'PATCH', body: { visibility: 'private' } })
  expect(state.requests).toContainEqual({ path: '/api/me/music-planet/moments/moment%2Fa', method: 'PATCH', body: { visibility: 'private' } })

  state.failNextPlanetPatch = true
  fireEvent.click(planetVisibility)
  expect((await screen.findByRole('alert')).textContent).toContain('设置没有保存')
  expect(planetVisibility.checked).toBe(false)
})

test('account deletion requires an emailed code and typed confirmation before resetting the authenticated app', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  let authenticated = true
  const requests: Array<{ path: string; method?: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && !authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (path === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/me/account/deletion-code' && init?.method === 'POST') return Response.json({ ok: true })
    if (path === '/api/me/account' && init?.method === 'DELETE') {
      authenticated = false
      return Response.json({ ok: true })
    }
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('button', { name: '我的星球' })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  expect(screen.getByText(/删除后将移除登录身份、星球、Moment、私信、Orbit/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '发送账号删除验证码' }))
  await screen.findByText(/删除验证码已发送/)
  fireEvent.change(screen.getByLabelText('六位验证码'), { target: { value: '123456' } })
  fireEvent.change(screen.getByLabelText('输入 DELETE 确认'), { target: { value: 'delete' } })
  expect((screen.getByRole('button', { name: '永久删除账号与资料' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('输入 DELETE 确认'), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: '永久删除账号与资料' }))
  await screen.findByRole('heading', { name: /邮箱验证码，进入 Moodverse/ })
  expect(requests).toContainEqual({ path: '/api/me/account/deletion-code', method: 'POST' })
  expect(requests).toContainEqual({ path: '/api/me/account', method: 'DELETE', body: { code: '123456', confirmation: 'DELETE' } })
})

test('an owner can edit planet details, manage one to five selected songs, and choose a primary song', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {},
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const state = { planet: ownerPlanet, patch: null as Record<string, unknown> | null }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && init?.method === 'PATCH') {
      state.patch = JSON.parse(String(init.body)) as Record<string, unknown>
      const update = state.patch
      const trackIds = update.trackIds as string[]
      state.planet = {
        ...state.planet,
        displayName: update.displayName as string,
        tagline: update.tagline as string,
        tracks: trackIds.map((id, position) => ({ ...tracks.find((track) => track.id === id)!, position, isPrimary: id === update.primaryTrackId, selectedAt: '2026-09-30T00:00:00.000Z' })),
      }
      return Response.json({ planet: state.planet })
    }
    if (path === '/api/me/music-planet') return Response.json({ planet: state.planet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('button', { name: '我的星球' })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '账户与隐私设置' })

  fireEvent.change(screen.getByLabelText('星球名称'), { target: { value: '新的名字' } })
  fireEvent.change(screen.getByLabelText('星球简介'), { target: { value: '新的简介' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '星球歌曲：远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '星球歌曲：月面信号 · 月面' }))
  fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))

  expect(await screen.findByText('星球资料已保存。')).toBeTruthy()
  expect(state.patch).toEqual({
    displayName: '新的名字', tagline: '新的简介',
    trackIds: ['song-a', 'song-b', 'song-c', 'song-d', 'song-e'], primaryTrackId: 'song-d',
  })
  expect((screen.getByLabelText('星球歌曲：远岸 · 远岸') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('星球主旋律：远岸 · 远岸') as HTMLInputElement).checked).toBe(true)
  for (const track of tracks.slice(1)) {
    fireEvent.click(screen.getByRole('checkbox', { name: `星球歌曲：${track.title} · ${track.artistName}` }))
  }
  const lastSong = screen.getByRole('checkbox', { name: '星球歌曲：夜航 · 星际旅人' }) as HTMLInputElement
  expect(lastSong.checked).toBe(true)
  expect(lastSong.disabled).toBe(true)
})

test('settings distinguish a failed Moment read from an empty Moment list and allow retry', async () => {
  let failMomentRead = true
  const planet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  const moment = {
    id: 'moment-a', trackId: 'song-a', track: tracks[0], contentText: '一段记录。', photoUrl: null,
    visibility: 'public' as const, publishedAt: '2026-09-29T10:00:00.000Z',
    createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet })
    if (path === '/api/me/music-planet/moments') {
      if (failMomentRead) {
        failMomentRead = false
        return Response.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 })
      }
      return Response.json({ moments: [moment] })
    }
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('button', { name: '我的星球' })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  expect((await screen.findByRole('alert')).textContent).toContain('当前显示的内容不代表没有记录')
  expect(screen.queryByText('还没有 Moment。写下之后，你可以在这里决定每条内容是否公开。')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  expect(await screen.findByRole('checkbox', { name: '公开 Moment：夜航' })).toBeTruthy()
})

test('an owner can open an exact-song portal and visit a matching public planet', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着三首歌长成。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const remotePlanet = {
    ...ownerPlanet,
    id: 'planet-remote', displayName: '潮汐边', tagline: '风把相似的歌吹到一起。',
    tracks: [tracks[0], tracks[3]].map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
    moments: [{
      id: 'remote-moment', trackId: 'song-a', track: tracks[0], contentText: '夜色把路照亮了一点。',
      photoUrl: null, visibility: 'public', publishedAt: '2026-09-29T10:00:00.000Z',
      createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
    }],
  }
  const requested: string[] = []
  const visitPayloads: unknown[] = []
  const reportPayloads: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/music/song-portal') return Response.json({
      trackId: 'song-a',
      ranking: { mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-ml' }, taskId: 'rank-task' },
      matches: [{
        planetId: 'planet-remote', displayName: '潮汐边', tagline: remotePlanet.tagline,
        matchSource: 'active_selection', selectedAt: '2026-09-29T09:00:00.000Z', latestPublicMomentAt: null,
        rankScore: .91, reasonCode: 'shared_song_selection',
      }],
    })
    if (url.pathname === '/api/music/planets/planet-remote/visit') {
      visitPayloads.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    if (url.pathname === '/api/me/reports' && init?.method === 'POST') {
      reportPayloads.push(JSON.parse(String(init.body)))
      return Response.json({ report: { id: 'report-a', status: 'open' } }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '留在这里的歌' })
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  expect(await screen.findByText('AI 已在精确同歌候选中排序')).toBeTruthy()
  expect(screen.getByText('潮汐边')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮汐边' }))
  expect(await screen.findByRole('dialog')).toBeTruthy()
  const incognito = screen.getByRole('checkbox', { name: /隐身访问/ }) as HTMLInputElement
  expect(incognito.checked).toBe(false)
  fireEvent.click(incognito)
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  expect(await screen.findByRole('heading', { name: '潮汐边' })).toBeTruthy()
  expect(screen.getByText('夜色把路照亮了一点。')).toBeTruthy()
  expect(screen.getByRole('link', { name: '夜航 · 星际旅人 · 在官方平台打开' }).getAttribute('href'))
    .toBe('https://music.example/a')
  expect(requested).toContain('/api/music/song-portal')
  expect(requested).toContain('/api/music/planets/planet-remote/visit')
  expect(visitPayloads).toEqual([{ isIncognito: true, source: 'song_portal', trackId: 'song-a' }])

  fireEvent.click(screen.getByRole('button', { name: '举报这条 Moment' }))
  fireEvent.change(screen.getByLabelText('举报原因'), { target: { value: 'privacy' } })
  fireEvent.change(screen.getByLabelText('补充说明（可选）'), { target: { value: '请核查这段公开内容。' } })
  fireEvent.click(screen.getByRole('button', { name: '提交举报' }))
  expect(await screen.findByText('举报已提交，感谢提醒。')).toBeTruthy()
  expect(reportPayloads).toEqual([{
    target: { type: 'moment', id: 'remote-moment' }, reason: 'privacy', detail: '请核查这段公开内容。',
  }])
})

test('a visitor can browse public Galaxy planets by genre and open one without a shared-song claim', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public', visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '只属于我的星球视觉摘要。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const remotePlanet = {
    id: 'planet-galaxy', displayName: '潮汐边', tagline: '雨后的风吹过这里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '云层缓慢移动。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: [{ ...tracks[1], position: 0, isPrimary: true, selectedAt: '2026-09-29T00:00:00.000Z' }],
    moments: [],
  }
  const requested: string[] = []
  const visitBodies: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/music/galaxy') return Response.json({
      by: 'genre', groups: [{ key: 'indie', label: 'indie', planetCount: 1, planets: [
        { planetId: 'planet-galaxy', displayName: '潮汐边', tagline: remotePlanet.tagline, reasonCode: 'same_genre' },
      ] }],
    })
    if (url.pathname === '/api/music/planets/planet-galaxy/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '留在这里的歌' })
  expect(screen.queryByRole('button', { name: 'Galaxy' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Galaxy' }))
  expect(await screen.findByRole('heading', { name: 'Galaxy' })).toBeTruthy()
  expect(screen.queryByText('只属于我的星球视觉摘要。')).toBeNull()
  expect(await screen.findByRole('button', { name: 'indie · 1' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'indie · 1' }))
  expect(await screen.findByRole('button', { name: '访问星球 潮汐边' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮汐边' }))
  expect(await screen.findByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  expect(await screen.findByRole('heading', { name: '潮汐边' })).toBeTruthy()
  expect(screen.getByText('公开星球 · 正在访问')).toBeTruthy()
  expect(requested).toContain('/api/music/galaxy?by=genre')
  expect(requested).toContain('/api/music/planets/planet-galaxy/visit')
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'galaxy' }])
})

test('homepage random roam shows model-ranked public discoveries and asks before leaving a visible or incognito visit trace', async () => {
  const remotePlanet = {
    id: 'planet-roam', displayName: '寂静河岸', tagline: '夜色和海风留在同一段旋律里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '云层缓慢移动。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  const visitBodies: unknown[] = []
  const requested: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/music/discovery') return Response.json({
      ranking: { mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' }, taskId: 'discovery-task' },
      recommendations: [{ planetId: 'planet-roam', displayName: '寂静河岸', tagline: remotePlanet.tagline, reasonCode: 'similar_moment', matchScore: .87 }],
    })
    if (url.pathname === '/api/music/planets/planet-roam/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: '随机漫游' }))
  expect(await screen.findByRole('heading', { name: '随机漫游' })).toBeTruthy()
  expect(await screen.findByText('本地语义模型 · qwen3-embedding-local 已参与排序')).toBeTruthy()
  expect(screen.getByText('公开 Moment 的文字氛围相近')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 寂静河岸' }))
  expect(await screen.findByRole('dialog')).toBeTruthy()
  expect(screen.getByText(/默认会在对方的 Orbit 留下最近访问足迹/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  expect(await screen.findByRole('heading', { name: '寂静河岸' })).toBeTruthy()
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'random_roam' }])
  expect(requested).toContain('/api/music/discovery')
  expect(requested).toContain('/api/music/planets/planet-roam/visit')
})

test('My Orbit separates its five groups and visiting a daily route happens only after explicit confirmation', async () => {
  const remotePlanet = {
    id: 'planet-daily', displayName: '潮声', tagline: '今晚沿着海风走。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '潮汐缓慢起伏。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'mist', motion: 'flow', particleDensity: .28 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  const visitBodies: unknown[] = []
  const requested: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [{ planetId: 'planet-song', displayName: '同歌星球', tagline: '', occurredAt: '2026-09-29T00:00:00.000Z' }],
      friends: [{ userId: 'friend-1', planetId: null, displayName: '好友星球', tagline: '', occurredAt: '2026-09-28T00:00:00.000Z', canVisit: false }],
      visitedByMe: [{ planetId: 'planet-visited', displayName: '我访问过', tagline: '', occurredAt: '2026-09-27T00:00:00.000Z', isIncognito: true }],
      visitorsToMe: [{ planetId: 'planet-visitor', displayName: '来访星球', tagline: '', occurredAt: '2026-09-26T00:00:00.000Z', userId: 'visitor-1' }],
      dailyRoam: [{ planetId: 'planet-daily', displayName: '潮声', tagline: remotePlanet.tagline, occurredAt: '2026-09-30T00:00:00.000Z', reasonCode: 'similar_genre', matchScore: .82 }],
    } })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (url.pathname === '/api/music/planets/planet-daily/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  expect(await screen.findByRole('heading', { name: 'My Orbit' })).toBeTruthy()
  expect(await screen.findByText('撞歌遇见')).toBeTruthy()
  expect(screen.getByText('好友')).toBeTruthy()
  expect(screen.getAllByText('我访问过')).toHaveLength(2)
  expect(screen.getByText('访问过我')).toBeTruthy()
  expect(screen.getByText('路过的星球')).toBeTruthy()
  expect(screen.getByText('隐身访问 · 仅你可见')).toBeTruthy()
  expect(requested).toContain('/api/me/orbit')
  expect(visitBodies).toEqual([])

  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮声' }))
  expect(await screen.findByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '继续访问' }))
  expect(await screen.findByRole('heading', { name: '潮声' })).toBeTruthy()
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'daily_roam' }])
})

test('My Orbit lets users answer friend requests and open a friend-only text conversation', async () => {
  let accepted = false
  let blocked = false
  const sentMessages: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: accepted ? [{ userId: 'friend-a', planetId: 'friend-planet', displayName: '海边的人', tagline: '今晚听潮', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: true, unreadCount: 1 }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/me/friend-requests/request-a' && init?.method === 'PATCH') {
      accepted = true
      return Response.json({ requestId: 'request-a', status: 'accepted' })
    }
    if (url.pathname === '/api/me/friend-requests') return Response.json({
      incoming: accepted ? [] : [{ id: 'request-a', userId: 'friend-a', planetId: 'friend-planet', displayName: '海边的人', tagline: '今晚听潮', status: 'pending', createdAt: '2026-09-30T09:00:00.000Z' }],
      outgoing: [],
    })
    if (url.pathname === '/api/me/friends/friend-a/messages' && init?.method === 'POST') {
      if (blocked) return Response.json({ error: 'USER_BLOCKED' }, { status: 403 })
      const contentText = (JSON.parse(String(init.body)) as { contentText: string }).contentText
      sentMessages.push(contentText)
      return Response.json({ message: { id: 'message-new', contentText, createdAt: '2026-09-30T10:00:00.000Z', readAt: null, isOwn: true } }, { status: 201 })
    }
    if (url.pathname === '/api/me/friends/friend-a/messages') return Response.json({ peerUserId: 'friend-a', messages: [
      { id: 'message-old', contentText: '海面今天很安静。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'My Orbit' }))
  expect(await screen.findByText('收到的好友请求')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: '接受 海边的人' }))

  expect(await screen.findByRole('button', { name: /私信 海边的人/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /私信 海边的人/ }))
  expect(await screen.findByText('海面今天很安静。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '我也在听。' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('我也在听。')).toBeTruthy()
  blocked = true
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '这条会被服务端拒绝。' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('此好友关系已被屏蔽，无法发送消息。')).toBeTruthy()
  expect(sentMessages).toEqual(['我也在听。'])
})

test('a visitor can send a friend request from a public planet and block its owner', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  const socialCalls: Array<{ path: string; method?: string; body?: unknown }> = []
  const remotePlanet = {
    id: 'public-planet', displayName: '雨声收集者', tagline: '把今晚的歌留在这里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着音乐生长。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'mist', motion: 'drift', particleDensity: .3 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname.startsWith('/api/me/friend-requests') || url.pathname === '/api/me/blocks') {
      socialCalls.push({ path: url.pathname, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    }
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [{ key: 'ambient', label: 'ambient', planetCount: 1, planets: [
      { planetId: 'public-planet', displayName: '雨声收集者', tagline: remotePlanet.tagline, reasonCode: 'same_genre' },
    ] }] })
    if (url.pathname === '/api/music/planets/public-planet/visit') return Response.json({ planet: remotePlanet })
    if (url.pathname === '/api/me/friend-requests' && init?.method === 'POST') return Response.json({ request: { id: 'request-out', status: 'pending', planetId: 'public-planet' } }, { status: 201 })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [{ id: 'request-out', userId: 'owner-b', planetId: 'public-planet', displayName: '雨声收集者', tagline: '', status: 'pending', createdAt: '2026-09-30T10:00:00.000Z' }] })
    if (url.pathname === '/api/me/blocks' && init?.method === 'POST') return Response.json({ ok: true })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'Galaxy' }))
  fireEvent.click(await screen.findByRole('button', { name: 'ambient · 1' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 雨声收集者' }))
  fireEvent.click(await screen.findByRole('button', { name: '继续访问' }))
  expect(await screen.findByRole('heading', { name: '雨声收集者' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '发送好友请求' }))
  expect(await screen.findByText('好友请求已发送；对方接受后，你们会出现在彼此的好友 Orbit 中。')).toBeTruthy()
  expect((screen.getByRole('button', { name: '好友请求已发送' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '屏蔽此人' }))
  expect(await screen.findByRole('heading', { name: 'Galaxy' })).toBeTruthy()
  expect(socialCalls).toEqual([
    { path: '/api/me/friend-requests', method: 'POST', body: { planetId: 'public-planet' } },
    { path: '/api/me/friend-requests' },
    { path: '/api/me/blocks', method: 'POST', body: { planetId: 'public-planet' } },
  ])
})

test('a visitor can send, receive, open, comment on and release a drift bottle', async () => {
  let sentToday = false
  let receiving = true
  let released = false
  const bottlePayloads: unknown[] = []
  const commentPayloads: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/drift-bottles' && init?.method === 'POST') {
      bottlePayloads.push(JSON.parse(String(init.body)))
      sentToday = true
      return Response.json({ sentToday: true, bottle: { id: 'sent-bottle', status: 'delivered', topic: { type: 'song' }, createdAt: '2026-09-30T10:00:00.000Z' } }, { status: 201 })
    }
    if (url.pathname === '/api/me/drift-bottles') return Response.json({
      date: '2026-09-30', allowReceiving: receiving, sentToday,
      inbox: released ? [] : [{ id: 'incoming-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: 'unread', deliveredAt: '2026-09-30T09:00:00.000Z', expiresAt: '2026-09-30T10:00:00.000Z' }],
      sent: sentToday ? [{ id: 'sent-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: 'delivered', deliveryCount: 1, createdAt: '2026-09-30T10:00:00.000Z' }] : [],
    })
    if (url.pathname === '/api/me/social-settings' && init?.method === 'PATCH') {
      receiving = (JSON.parse(String(init.body)) as { allowDriftBottles: boolean }).allowDriftBottles
      return Response.json({ allowFriendRequests: true, allowDriftBottles: receiving })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle' && init?.method === 'PATCH') {
      const action = (JSON.parse(String(init.body)) as { action: string }).action
      if (action === 'release') released = true
      return Response.json(action === 'open' ? { delivery: { status: 'read' }, alreadyOpened: false } : { released: true, status: 'waiting' })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle') return Response.json({
      bottle: { id: 'incoming-bottle', topic: { type: 'song', track: { id: 'song-a', title: '夜航', artistName: '星际旅人', versionLabel: '', officialUrl: 'https://music.example/a', coverUrl: null } }, messageText: '沿着这首歌继续漂流。', sender: null },
      delivery: { id: 'delivery-a', status: 'read', deliveredAt: '2026-09-30T09:00:00.000Z', expiresAt: '2026-09-30T10:00:00.000Z', canRelease: true },
      comments: [],
    })
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle/comments' && init?.method === 'POST') {
      const contentText = (JSON.parse(String(init.body)) as { contentText: string }).contentText
      commentPayloads.push(contentText)
      return Response.json({ comment: { id: 'comment-a', contentText, createdAt: '2026-09-30T09:30:00.000Z', authorName: '你', isOwn: true, likeCount: 0, likedByMe: false } }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: '漂流瓶' }))
  expect(await screen.findByRole('heading', { name: '漂流瓶' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/附上一句话/), { target: { value: '沿着这首歌继续漂流。' } })
  fireEvent.click(screen.getByRole('button', { name: '放出漂流瓶 ↗' }))
  expect(await screen.findByRole('button', { name: '今日已放流' })).toBeTruthy()
  expect(bottlePayloads).toEqual([{ topic: { type: 'song', trackId: 'song-a' }, messageText: '沿着这首歌继续漂流。' }])

  fireEvent.click(screen.getByRole('button', { name: '打开漂流瓶' }))
  expect(await screen.findByText('沿着这首歌继续漂流。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('添加评论'), { target: { value: '我也把这首歌放进今晚。' } })
  fireEvent.click(screen.getByRole('button', { name: '留下评论' }))
  expect(await screen.findByText('我也把这首歌放进今晚。')).toBeTruthy()
  expect(commentPayloads).toEqual(['我也把这首歌放进今晚。'])
  fireEvent.click(screen.getByRole('button', { name: '继续放流 ↗' }))
  expect(await screen.findByText('你已放流；系统暂时没有找到下一位，会继续寻找。')).toBeTruthy()

  const receiveToggle = screen.getByRole('checkbox', { name: /接收漂流瓶/ }) as HTMLInputElement
  expect(receiveToggle.checked).toBe(true)
  fireEvent.click(receiveToggle)
  expect(await screen.findByText('关闭后不会收到新的投递；已收到的瓶仍可处理。')).toBeTruthy()
  expect(receiving).toBe(false)
})
