// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { scheduleMusicPrefetch } from '../src/music/prefetch'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
test('prefetch defers work, bounds it to two pages and runs requests sequentially', async () => {
  vi.useFakeTimers(); vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const order:number[]=[]; let release!:()=>void
  const stop=scheduleMusicPrefetch([
    async()=>{order.push(1);await new Promise<void>(r=>{release=r})},
    async()=>{order.push(2)}, async()=>{order.push(3)},
  ])
  expect(order).toEqual([])
  await vi.advanceTimersByTimeAsync(1500); expect(order).toEqual([1])
  release(); await vi.runAllTimersAsync(); expect(order).toEqual([1,2])
  stop()
})
test('hidden pages, data saver and cancellation do not start speculative requests', async () => {
  vi.useFakeTimers(); const job=vi.fn(async()=>{})
  vi.spyOn(document,'hidden','get').mockReturnValue(true)
  scheduleMusicPrefetch([job]); await vi.runAllTimersAsync()
  expect(job).not.toHaveBeenCalled()
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const stop=scheduleMusicPrefetch([job]); stop(); await vi.runAllTimersAsync()
  expect(job).not.toHaveBeenCalled()
  vi.stubGlobal('navigator',{connection:{saveData:true}})
  scheduleMusicPrefetch([job]); await vi.runAllTimersAsync()
  expect(job).not.toHaveBeenCalled()
})
