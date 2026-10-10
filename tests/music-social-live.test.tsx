// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import type { MusicSocialSnapshot } from '../src/music-api'

class SocialEventSource extends EventTarget {
  static instances: SocialEventSource[] = []
  closed = false
  constructor(readonly url: string) {
    super(); SocialEventSource.instances.push(this)
    queueMicrotask(() => { if (!this.closed) this.dispatchEvent(new Event('open')) })
  }
  close() { this.closed = true }
  send(snapshot: MusicSocialSnapshot) { this.dispatchEvent(new MessageEvent('social', { data: JSON.stringify(snapshot) })) }
}
const empty = (): MusicSocialSnapshot => ({ incoming: [], outgoing: [], friends: [] })
const pending = { id: 'request-a', userId: 'peer', planetId: 'peer-planet', displayName: '手机星球', tagline: '', status: 'pending' as const, createdAt: '2026-10-10' }
const friend = { userId: 'peer', planetId: 'peer-planet', displayName: '手机星球', tagline: '', occurredAt: '2026-10-10', canVisit: true, unreadCount: 0 }
let snapshot: MusicSocialSnapshot
let responseDelay: Promise<MusicSocialSnapshot> | undefined
let orbitDelay: Promise<Response> | undefined
let writes: Array<{ path: string; body: unknown }>

beforeEach(() => {
  snapshot = empty(); responseDelay = undefined; orbitDelay = undefined; writes = []; SocialEventSource.instances = []
  vi.stubGlobal('EventSource', SocialEventSource)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://mosic.test')
    if (init?.method && init.method !== 'GET') writes.push({ path: url.pathname, body: init.body ? JSON.parse(String(init.body)) : null })
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks: [] })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: { id: 'my-planet', displayName: '电脑星球', visibility: 'public', tracks: [] } })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/friend-satellites') return Response.json({ friendSatellites: [] })
    if (url.pathname === '/api/me/friend-requests') {
      const data = responseDelay ? await responseDelay : structuredClone(snapshot)
      return Response.json(url.searchParams.has('live') ? data : { incoming: data.incoming, outgoing: data.outgoing })
    }
    if (url.pathname === '/api/me/friend-requests/request-a' && init?.method === 'PATCH') {
      snapshot = { ...empty(), friends: [friend] }
      return Response.json({ requestId: 'request-a', status: 'accepted' })
    }
    if (url.pathname === '/api/me/orbit') return orbitDelay ?? Response.json({ date: '2026-10-10', groups: {
      friends: snapshot.friends, songEncounters: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/music/discovery') return Response.json({
      recommendations: [...snapshot.friends.map(friend => ({ planetId: friend.planetId, displayName: friend.displayName, tagline: '', reasonCode: 'random', matchScore: 0 })),
        { planetId: 'control', displayName: '正常星球', tagline: '', reasonCode: 'random', matchScore: 0 }],
      ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null },
    })
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function liveSource() {
  await waitFor(() => expect(SocialEventSource.instances.filter(s => !s.closed).length).toBe(1), { timeout: 10000 })
  return SocialEventSource.instances.find(s => !s.closed)!
}
function push(source: SocialEventSource, value: MusicSocialSnapshot) {
  snapshot = value
  act(() => source.send(value))
}

test('a new request reaches the cockpit, opens Orbit, and accepting removes pending state without a page refresh', async () => {
  render(<MusicApp />)
  const source = await liveSource()
  push(source, { ...empty(), incoming: [pending] })
  expect(await screen.findByText(/手机星球.*发来了好友请求/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '查看好友请求' }))
  fireEvent.click(await screen.findByRole('button', { name: '接受 手机星球' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '接受 手机星球' })).toBeNull())
  expect(await screen.findByRole('button', { name: '私信 手机星球' })).toBeTruthy()
  expect(writes).toEqual([{ path: '/api/me/friend-requests/request-a', body: { action: 'accept' } }])
})

test('acceptance on the other device replaces pending with friends even when an older Orbit response arrives late', async () => {
  snapshot = { ...empty(), outgoing: [pending] }
  let resolveOrbit!: (response: Response) => void
  orbitDelay = new Promise(resolve => { resolveOrbit = resolve })
  const mounted = render(<MusicApp />)
  const source = await liveSource()
  fireEvent.click(screen.getByRole('button', { name: 'Orbit', exact: true }))
  push(await liveSource(), { ...empty(), friends: [friend] })
  expect(await screen.findByText(/手机星球.*成为好友/)).toBeTruthy()
  await act(async () => resolveOrbit(Response.json({ date: '2026-10-10', groups: { friends: [], songEncounters: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })))
  expect(await screen.findByRole('button', { name: '私信 手机星球' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: '个人终端' })).queryByText('等待对方回应')).toBeNull()
  mounted.unmount()
  expect(source.closed).toBe(true)
})

test('returning to the foreground resyncs automatically and ignores messages from the old connection', async () => {
  snapshot = { ...empty(), outgoing: [pending] }
  render(<MusicApp />)
  const old = await liveSource()
  snapshot = { ...empty(), friends: [friend] }
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(old.closed).toBe(true))
  const current = await liveSource()
  expect(current).not.toBe(old)
  act(() => old.send({ ...empty(), outgoing: [pending] }))
  fireEvent.click(screen.getByRole('button', { name: 'Orbit', exact: true }))
  expect(await screen.findByRole('button', { name: '私信 手机星球' })).toBeTruthy()
  expect(screen.queryByText('等待对方回应')).toBeNull()
})

test('friend unread counts stay inside the message action without adding a separate card row', async () => {
  snapshot = { ...empty(), friends: [{ ...friend, unreadCount: 3 }] }
  render(<MusicApp />)
  await liveSource()
  fireEvent.click(screen.getByRole('button', { name: 'Orbit', exact: true }))
  const message = await screen.findByRole('button', { name: '私信 手机星球，未读 3 条' })
  expect(message.textContent).toBe('私信 · 3')
  const card = message.closest('article')!
  expect(within(card).queryByText('未读 3 条')).toBeNull()
  expect(card.querySelector('.music-discovery-match-copy small')).toBeNull()
  push(await liveSource(), { ...empty(), friends: [{ ...friend, canVisit: false, unreadCount: 3 }] })
  expect(await within(card).findByText('星球当前不可公开访问')).toBeTruthy()
  expect(within(card).queryByRole('button', { name: '访问星球' })).toBeNull()
})

test('new chat activity updates the visible five friend satellites even when the friendship list is unchanged', async () => {
  const peers=Array.from({length:6},(_,i)=>({...friend,userId:`peer-${i}`,planetId:`planet-${i}`,displayName:`好友${i}`}))
  snapshot={...empty(),friends:peers}
  const originalFetch=globalThis.fetch
  vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(new URL(String(input),'https://mosic.test').pathname==='/api/me/friend-satellites') {
      const latest=snapshot.friends.find(f=>'lastMessageAt' in f)
      const sorted=latest ? [latest,...peers.filter(f=>f.userId!==latest.userId)] : peers
      return Response.json({friendSatellites:sorted.map(f=>({id:`friend-${f.userId}`,planetId:f.planetId,displayName:f.displayName,tagline:'',color:'#ffffff',visualSeed:f.userId,orbitRadius:.3,orbitPhase:0,isVirtual:false,canRemove:false}))})
    }
    return originalFetch(input,init)
  })
  render(<MusicApp />)
  await liveSource()
  fireEvent.click(screen.getByRole('button',{name:'跃迁'}))
  await screen.findByRole('button',{name:'好友卫星 好友0'},{timeout:10000})
  expect(screen.queryByRole('button',{name:'好友卫星 好友5'})).toBeNull()
  push(await liveSource(),{...empty(),friends:peers.map(f=>f.userId==='peer-5'?{...f,lastMessageAt:'2026-10-10T05:00:00Z'}:f)})
  expect(await screen.findByRole('button',{name:'好友卫星 好友5'},{timeout:5000})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'好友卫星 好友4'})).toBeNull()
},20000)

test('opening Orbit refreshes an accepted request even if the current stream missed the change', async () => {
  snapshot = { ...empty(), outgoing: [pending] }
  render(<MusicApp />)
  await liveSource()
  snapshot = { ...empty(), friends: [friend] }
  fireEvent.click(screen.getByRole('button', { name: 'Orbit', exact: true }))
  expect(await screen.findByRole('button', { name: '私信 手机星球' })).toBeTruthy()
  expect(screen.queryByText('等待对方回应')).toBeNull()
})

test('losing a friendship on the other device refreshes visible roam results without resurrecting the cached peer', async () => {
  snapshot = { ...empty(), friends: [friend] }
  render(<MusicApp />)
  const source = await liveSource()
  fireEvent.click(screen.getByRole('button', { name: '漫游', exact: true }))
  await screen.findByRole('button', { name: '访问星球 手机星球' })
  push(source, empty())
  await waitFor(() => expect(screen.queryByRole('button', { name: '访问星球 手机星球' })).toBeNull())
  await screen.findByRole('button', { name: '访问星球 正常星球' })
  expect(writes).toEqual([])
}, 20000)

test.each(['midnight', 'foreground'])('the open universe and roam refresh after the daily boundary on %s', async trigger => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-10-10T15:59:59Z'))
  const baseFetch = globalThis.fetch
  let day = '昨日', galaxyReads = 0, satelliteReads = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://mosic.test')
    if (url.pathname === '/api/me/friend-satellites') satelliteReads++
    if (url.pathname === '/api/music/galaxy') {
      galaxyReads++
      return Response.json({ by: url.searchParams.get('by'), groups: [{ key: 'pop', label: `${day}星系`, planetCount: 0, planets: [] }] })
    }
    if (url.pathname === '/api/music/discovery') return Response.json({
      recommendations: [{ planetId: day, displayName: `${day}星球`, tagline: '', reasonCode: 'random', matchScore: 0 }],
      ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null },
    })
    return baseFetch(input, init)
  })
  await act(async () => { render(<MusicApp />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '漫游', exact: true })) })
  expect(screen.getByRole('button', { name: '访问星球 昨日星球' })).toBeTruthy()
  const previousReads = galaxyReads, previousSatelliteReads = satelliteReads
  day = '今日'
  await act(async () => {
    if (trigger === 'midnight') await vi.advanceTimersByTimeAsync(1000)
    else { vi.setSystemTime(new Date('2026-10-10T16:00:05Z')); window.dispatchEvent(new Event('focus')) }
  })
  expect(screen.queryByRole('button', { name: '访问星球 昨日星球' })).toBeNull()
  expect(screen.getByRole('button', { name: '访问星球 今日星球' })).toBeTruthy()
  expect(galaxyReads).toBeGreaterThan(previousReads)
  expect(satelliteReads).toBeGreaterThan(previousSatelliteReads)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新今日漫游 ↗' })) })
  expect(screen.getByRole('button', { name: '访问星球 今日星球' })).toBeTruthy()
  expect(writes).toEqual([])
}, 20000)
