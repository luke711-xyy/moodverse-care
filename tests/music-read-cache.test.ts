import { afterEach, expect, test, vi } from 'vitest'
import { createMusicApi } from '../src/music-api'

afterEach(() => vi.restoreAllMocks())
test('public music reads share in-flight work and reuse successful pages briefly', async () => {
  let finish!: (r: Response) => void
  const response = new Promise<Response>(resolve => { finish = resolve })
  const fetcher = vi.fn(async () => (await response).clone())
  const api = createMusicApi(fetcher)
  const a = api.loadGalaxyContent('artist', 'a'), b = api.loadGalaxyContent('artist', 'a')
  finish(Response.json({ label: 'Artist', tracks: [], status: 'live' }))
  expect((await a).label).toBe('Artist'); expect((await b).label).toBe('Artist')
  expect((await api.loadGalaxyContent('artist', 'a')).label).toBe('Artist')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
test('one cancelled consumer does not cancel another reader or poison the cache', async () => {
  let finish!: (r: Response) => void
  const response = new Promise<Response>(resolve => { finish = resolve })
  const fetcher = vi.fn(async () => (await response).clone())
  const api = createMusicApi(fetcher), controller = new AbortController()
  const cancelled = api.searchCatalog('night', '', 0, controller.signal)
  const caught = cancelled.catch(error => error.name)
  const active = api.searchCatalog('night')
  controller.abort(); finish(Response.json({ tracks: [{ id: 'night' }] }))
  expect(await caught).toBe('AbortError')
  expect((await active).tracks[0].id).toBe('night')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
test('private reads stay fresh and public cache expires and excludes offline results', async () => {
  let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now)
  let offline = false
  const fetcher = vi.fn(async () => Response.json({ tracks: [], friendSatellites: [], status: offline ? 'offline' : 'live' }))
  const api = createMusicApi(fetcher)
  await api.loadFriendSatellites(); await api.loadFriendSatellites()
  expect(fetcher).toHaveBeenCalledTimes(2)
  await api.searchCatalog('a'); await api.searchCatalog('a')
  expect(fetcher).toHaveBeenCalledTimes(3)
  now += 121000; await api.searchCatalog('a')
  expect(fetcher).toHaveBeenCalledTimes(4)
  offline = true; await api.searchCatalog('b'); await api.searchCatalog('b')
  expect(fetcher).toHaveBeenCalledTimes(6)
})
test('failed reads retry, distinct queries stay isolated and cache storage is bounded', async () => {
  let fail = true
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (fail) { fail = false; return Response.json({ error: 'OFFLINE' }, { status: 503 }) }
    return Response.json({ tracks: [{ id: String(input) }] })
  })
  const api = createMusicApi(fetcher)
  await expect(api.searchCatalog('first')).rejects.toMatchObject({ status: 503 })
  expect((await api.searchCatalog('first')).tracks[0].id).toContain('q=first')
  expect((await api.searchCatalog('second')).tracks[0].id).toContain('q=second')
  for (let i=0;i<50;i++) await api.searchCatalog(`page-${i}`)
  const before=fetcher.mock.calls.length
  await api.searchCatalog('first')
  expect(fetcher.mock.calls.length).toBe(before+1)
})
