import { afterEach, expect, test, vi } from 'vitest'
import { createMusicApi } from '../src/music-api'
import { createGalaxyPreloader } from '../src/music/galaxy-preload'

afterEach(() => vi.useRealTimers())
const chart = (label:string) => Response.json({by:'song',groups:[{key:'song-a',label,planetCount:0,planets:[]}]})

test('prefetched and foreground readers share the same pending chart without another request', async () => {
  let finish!:(value:Response)=>void, calls=0
  const loader=createGalaxyPreloader(createMusicApi(async()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve})}))
  const first=loader.load('song'), second=loader.load('song')
  expect(second).toBe(first)
  finish(chart('Current cover'))
  expect((await second).groups[0].label).toBe('Current cover')
  expect((await loader.load('song')).groups[0].label).toBe('Current cover')
  expect(calls).toBe(1)
})

test('account invalidation cannot let an older pending request overwrite the new account chart', async () => {
  const pending:Array<(value:Response)=>void>=[]
  const loader=createGalaxyPreloader(createMusicApi(async()=>new Promise<Response>(resolve=>pending.push(resolve))))
  const old=loader.load('song')
  loader.clear()
  const current=loader.load('song')
  pending[1](chart('New account'))
  await current
  pending[0](chart('Old account'))
  await old
  expect((await loader.load('song')).groups[0].label).toBe('New account')
})

test('failed prefetches remain retryable and saved selections invalidate their chart', async () => {
  let calls=0
  const loader=createGalaxyPreloader(createMusicApi(async()=>++calls===1?Response.json({error:'offline'},{status:503}):chart(`Selection ${calls}`)))
  await expect(loader.load('song')).rejects.toThrow()
  expect((await loader.load('song')).groups[0].label).toBe('Selection 2')
  loader.clear('song')
  expect((await loader.load('song')).groups[0].label).toBe('Selection 3')
})

test('charts refresh when the cache expires or the music day changes', async () => {
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-12T15:59:30Z'))
  let calls=0
  const loader=createGalaxyPreloader(createMusicApi(async()=>chart(`Day ${++calls}`)))
  expect((await loader.load('song')).groups[0].label).toBe('Day 1')
  vi.setSystemTime(new Date('2026-10-12T16:00:01Z'))
  expect((await loader.load('song')).groups[0].label).toBe('Day 2')
  vi.advanceTimersByTime(120_001)
  expect((await loader.load('song')).groups[0].label).toBe('Day 3')
})
