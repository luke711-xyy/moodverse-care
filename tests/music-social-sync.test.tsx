// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createMusicApi, type MusicSocialSnapshot } from '../src/music-api'
import { useSocialSync } from '../src/music/useSocialSync'

const empty = (): MusicSocialSnapshot => ({ incoming: [], outgoing: [], friends: [] })
const pending = { id: 'r1', userId: 'peer', planetId: 'peer-planet', displayName: '另一端', tagline: '', status: 'pending' as const, createdAt: '2026-10-10' }
beforeEach(() => { vi.stubGlobal('EventSource', undefined) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('friendship suppresses contradictory pending cards and notices without hiding a later legitimate request', async () => {
  let remote: MusicSocialSnapshot = { incoming: [pending], outgoing: [pending], friends: [{ userId: 'peer', planetId: 'peer-planet', displayName: '另一端', tagline: '', occurredAt: 'now', canVisit: true, unreadCount: 0 }] }
  const api = createMusicApi(async () => Response.json(remote), { liveSocial: false })
  const { result } = renderHook(() => useSocialSync(api, true, 0))
  await waitFor(() => expect(result.current.snapshot?.friends).toHaveLength(1))
  expect(result.current.snapshot?.incoming).toEqual([])
  expect(result.current.snapshot?.outgoing).toEqual([])
  expect(result.current.notice).toBe('')
  remote = { ...empty(), incoming: [pending] }
  await act(async () => { await result.current.refresh() })
  expect(result.current.snapshot?.incoming).toEqual([pending])
})

test('unsupported streaming still receives new requests automatically without navigation or refresh', async () => {
  vi.useFakeTimers()
  let remote = empty()
  const api = createMusicApi(async () => Response.json(remote))
  const { result } = renderHook(() => useSocialSync(api, true, 0))
  await act(async () => {})
  expect(result.current.snapshot).toEqual(empty())
  remote = { ...empty(), incoming: [pending] }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.snapshot?.incoming).toEqual([pending])
  expect(result.current.notice).toContain('另一端')
})

test('a late snapshot cannot undo a newer response and offline recovery fetches the latest state', async () => {
  let remote = empty(), delay: Promise<Response> | undefined
  const api = createMusicApi(async () => delay ?? Response.json(remote))
  const { result } = renderHook(() => useSocialSync(api, true, 0))
  await waitFor(() => expect(result.current.snapshot).toEqual(empty()))
  let release!: (response: Response) => void
  delay = new Promise(resolve => { release = resolve })
  act(() => { void result.current.refresh() })
  delay = undefined; remote = { ...empty(), incoming: [pending] }
  await act(async () => { await result.current.refresh() })
  await act(async () => { release(Response.json(empty())) })
  expect(result.current.snapshot?.incoming).toEqual([pending])
  act(() => window.dispatchEvent(new Event('offline')))
  expect(result.current.connection).toBe('offline')
  remote = empty()
  await act(async () => { window.dispatchEvent(new Event('online')) })
  await waitFor(() => expect(result.current.snapshot).toEqual(empty()))
})

test('account changes clear notifications and prevent a previous account response leaking into the new account', async () => {
  let remote = { ...empty(), incoming: [pending] }, delay: Promise<Response> | undefined
  const api = createMusicApi(async () => delay ?? Response.json(remote))
  const { result, rerender } = renderHook(({ epoch }) => useSocialSync(api, true, epoch), { initialProps: { epoch: 0 } })
  await waitFor(() => expect(result.current.notice).toContain('另一端'))
  let release!: (response: Response) => void
  delay = new Promise(resolve => { release = resolve })
  act(() => { void result.current.refresh() })
  delay = undefined; remote = empty()
  rerender({ epoch: 1 })
  await waitFor(() => expect(result.current.snapshot).toEqual(empty()))
  await act(async () => { release(Response.json({ ...empty(), incoming: [pending] })) })
  expect(result.current.snapshot).toEqual(empty())
  expect(result.current.notice).toBe('')
})
