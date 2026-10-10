// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'

const peer = { userId: 'peer', planetId: 'peer-planet' as string | null, displayName: '海边好友', tagline: '', canVisit: true, unreadCount: 0, occurredAt: '2026-10-10' }
let friends: typeof peer[], blocks: Array<{ userId: string; planetId: string | null; displayName: string; createdAt: string }>
let fail: boolean, writes: Array<{ path: string; method: string; body: unknown }>
beforeEach(() => {
  friends = [{ ...peer }]; blocks = []; fail = false; writes = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://mosic.test').pathname, method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (fail) return Response.json({ error: 'UNAVAILABLE' }, { status: 503 })
      if (path === '/api/me/blocks') { blocks = [{ userId: 'peer', planetId: friends[0].planetId, displayName: '海边好友', createdAt: '2026-10-10' }]; friends = [] }
      else if (path === '/api/me/blocks/peer') blocks = []
      else if (path === '/api/me/friends/peer') friends = []
      else throw new Error(`Unexpected write: ${path}`)
      return Response.json({ ok: true })
    }
    if (path === '/api/music/catalog') return Response.json({ tracks: [] })
    if (path === '/api/me/music-planet') return Response.json({ planet: null })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/friend-satellites') return Response.json({ friendSatellites: [] })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [], friends })
    if (path === '/api/me/blocks') return Response.json({ blocks })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/me/galaxy-preferences') return Response.json({ genres: ['Pop'], artists: [], songs: [] })
    if (path === '/api/music/galaxy-options') return Response.json({ options: [], hasMore: false, nextOffset: null })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-10-10', groups: { friends, songEncounters: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
    if (path === '/api/admin/music-reports') return Response.json({ error: 'FORBIDDEN' }, { status: 403 })
    throw new Error(`Unexpected read: ${path}`)
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function openSettings() {
  const mounted = render(<MusicApp />)
  fireEvent.click(await screen.findByRole('button', { name: '设置', exact: true }))
  await screen.findByRole('heading', { name: '设置', level: 2 })
  return mounted
}

test.each(['public', 'private'])('settings can block a %s friend, retain the unblock action after reload, and never restore friendship on unblock', async visibility => {
  if (visibility === 'private') friends[0] = { ...peer, planetId: null, canVisit: false }
  const mounted = await openSettings()
  const section = await screen.findByRole('region', { name: '好友管理' })
  fireEvent.click(await within(section).findByRole('button', { name: '屏蔽 海边好友' }))
  fireEvent.click(within(section).getByRole('button', { name: '取消' }))
  expect(writes).toEqual([])
  fireEvent.click(within(section).getByRole('button', { name: '屏蔽 海边好友' }))
  fireEvent.click(within(section).getByRole('button', { name: '确认屏蔽' }))
  await within(section).findByRole('button', { name: '解除屏蔽 海边好友' })
  expect(within(section).queryByRole('button', { name: '删除好友 海边好友' })).toBeNull()
  expect(writes).toEqual([{ path: '/api/me/blocks', method: 'POST', body: { userId: 'peer' } }])
  mounted.unmount()
  await openSettings()
  fireEvent.click(await screen.findByRole('button', { name: '解除屏蔽 海边好友' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '解除屏蔽 海边好友' })).toBeNull())
  expect(screen.queryByRole('button', { name: '删除好友 海边好友' })).toBeNull()
  expect(await screen.findByText(/已解除屏蔽「海边好友」.*不会自动恢复好友/)).toBeTruthy()
  expect(writes.at(-1)).toEqual({ path: '/api/me/blocks/peer', method: 'DELETE', body: null })
})

test('failed friend deletion preserves the row and retry deletes friendship without creating a block', async () => {
  await openSettings()
  const section = await screen.findByRole('region', { name: '好友管理' })
  fail = true
  fireEvent.click(await within(section).findByRole('button', { name: '删除好友 海边好友' }))
  fireEvent.click(within(section).getByRole('button', { name: '确认删除好友' }))
  expect(await within(section).findByRole('alert')).toBeTruthy()
  expect(within(section).getByRole('button', { name: '删除好友 海边好友' })).toBeTruthy()
  fail = false
  fireEvent.click(within(section).getByRole('button', { name: '确认删除好友' }))
  await waitFor(() => expect(within(section).queryByRole('button', { name: '删除好友 海边好友' })).toBeNull())
  expect(within(section).queryByRole('button', { name: '解除屏蔽 海边好友' })).toBeNull()
  expect(writes.every(write => write.path === '/api/me/friends/peer' && write.method === 'DELETE')).toBe(true)
})

test('failed block and unblock keep their last confirmed state', async () => {
  await openSettings()
  const section = await screen.findByRole('region', { name: '好友管理' })
  fail = true
  fireEvent.click(await within(section).findByRole('button', { name: '屏蔽 海边好友' }))
  fireEvent.click(within(section).getByRole('button', { name: '确认屏蔽' }))
  await within(section).findByRole('alert')
  expect(within(section).queryByRole('button', { name: '解除屏蔽 海边好友' })).toBeNull()
  fail = false
  fireEvent.click(within(section).getByRole('button', { name: '确认屏蔽' }))
  const unblock = await within(section).findByRole('button', { name: '解除屏蔽 海边好友' })
  fail = true
  fireEvent.click(unblock)
  await within(section).findByRole('alert')
  expect(within(section).getByRole('button', { name: '解除屏蔽 海边好友' })).toBeTruthy()
})

test.each(['cached', 'in-flight'])('blocking invalidates %s roam results so the old peer cannot reappear', async mode => {
  const baseFetch = globalThis.fetch
  let release!: (response: Response) => void, reads = 0
  const recommendation = (planetId: string, displayName: string) => ({ planetId, displayName, tagline: '', reasonCode: 'random', matchScore: 0 })
  const payload = (entries: ReturnType<typeof recommendation>[]) => ({ recommendations: entries,
    ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null } })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input), 'https://mosic.test').pathname !== '/api/music/discovery') return baseFetch(input, init)
    reads++
    if (reads === 1) return mode === 'in-flight' ? new Promise<Response>(resolve => { release = resolve })
      : Response.json(payload([recommendation('peer-planet', '海边好友')]))
    return Response.json(payload([recommendation('control-planet', '未屏蔽星球')]))
  })
  render(<MusicApp />)
  fireEvent.click(await screen.findByRole('button', { name: '漫游', exact: true }))
  await waitFor(() => expect(reads).toBe(1))
  if (mode === 'cached') await screen.findByRole('button', { name: '访问星球 海边好友' })
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  fireEvent.click(screen.getByRole('button', { name: '设置', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: '屏蔽 海边好友' }))
  fireEvent.click(screen.getByRole('button', { name: '确认屏蔽' }))
  await screen.findByRole('button', { name: '解除屏蔽 海边好友' })
  if (mode === 'in-flight') release(Response.json(payload([recommendation('peer-planet', '海边好友')])))
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  fireEvent.click(screen.getByRole('button', { name: '漫游', exact: true }))
  await screen.findByRole('button', { name: '访问星球 未屏蔽星球' })
  expect(screen.queryByRole('button', { name: '访问星球 海边好友' })).toBeNull()
})
