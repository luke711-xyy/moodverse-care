// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import { createDitherRenderer, type DitherFrame } from '../src/music/dither/renderer'
import { defaultCopilotSettings } from '../src/music/copilot/contracts'

vi.mock('../src/music/dither/renderer', () => ({ createDitherRenderer: vi.fn(() => { throw new Error('WebGL unavailable') }) }))

afterEach(() => {
  cleanup()
  localStorage.removeItem('mosic-first-run-v1')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setupDock(reducedMotion = true) {
  localStorage.setItem('mosic-first-run-v1', 'completed')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const firstReply = Promise.withResolvers<void>()
  const turns: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://mosic.test')
    switch (url.pathname) {
      case '/api/music/catalog': return Response.json({ tracks: [] })
      case '/api/me/music-planet': return Response.json({ planet: null })
      case '/api/music/galaxy':
        return Response.json({ by: url.searchParams.get('by'), groups: [
          { key: 'ambient', label: 'Ambient', planetCount: 0, planets: [] },
          { key: 'folk', label: 'Folk', planetCount: 1, planets: [{ planetId: 'folk-planet', displayName: 'Folk 星球', tagline: '' }] },
        ] })
      case '/api/music/galaxy-content':
        return Response.json({ by: 'genre', key: 'ambient', label: 'Ambient', tracks: [], status: 'local', hasMore: false })
      case '/api/me/copilot': {
        if (init?.method !== 'POST') return Response.json({
          settings: defaultCopilotSettings, messages: [], memories: [], capabilities: { platform: false, stt: false, tts: false },
        })
        const { requestId, text } = JSON.parse(String(init.body))
        turns.push(text)
        if (turns.length === 1) await firstReply.promise
        const createdAt = new Date().toISOString()
        return Response.json({ requestId, memories: [], messages: [
          { id: requestId + '-user', role: 'user', text, createdAt },
          { id: requestId + '-assistant', role: 'assistant', text: '答复：' + text, source: 'openai', createdAt },
        ] })
      }
      default: return Response.json({ moments: [], incoming: [], outgoing: [], friends: [], groups: [] })
    }
  })

  const view = render(<MusicApp replayFirstRunOnEntry={false} />)
  return { view, firstReply, turns }
}

test('a minimized conversation receives its pending reply, sends another turn and leaves the galaxy and cockpit usable', async () => {
  const { firstReply, turns } = setupDock()
  fireEvent.click(await screen.findByRole('button', { name: /舰载副驾，点按打开/ }))
  const projection = within(screen.getByRole('region', { name: '观察窗副驾投影' }))
  fireEvent.click(await projection.findByRole('button', { name: '设置与记忆' }))
  fireEvent.change(await projection.findByLabelText('本次连接'), { target: { value: 'openai' } })
  fireEvent.change(projection.getByLabelText('API 密钥'), { target: { value: 'test-session-key' } })
  fireEvent.click(projection.getByRole('button', { name: '通讯', exact: true }))
  const send = async (text: string) => {
    fireEvent.change(await projection.findByRole('textbox', { name: '发给副驾' }), { target: { value: text } })
    fireEvent.click(projection.getByRole('button', { name: /发送/ }))
  }
  await send('第一条')
  fireEvent.click(projection.getByRole('button', { name: '缩小副驾观察窗' }))
  firstReply.resolve()
  await projection.findByText('答复：第一条')
  await send('第二条')
  await projection.findByText('答复：第二条')
  expect(turns).toEqual(['第一条', '第二条'])

  expect(screen.getByRole('region', { name: '二维音乐宇宙' }).tabIndex).toBe(0)
  const folk = screen.getByRole('button', { name: '前往星系 Folk' })
  fireEvent.click(folk)
  expect(folk.getAttribute('aria-current')).toBe('step')
  fireEvent.click(screen.getByRole('button', { name: '场景星系：Ambient' }))
  const details = await screen.findByRole('dialog', { name: 'Ambient 星系' })
  fireEvent.click(within(details).getByRole('button', { name: '关闭星系窗口' }))
  fireEvent.click(projection.getByRole('button', { name: /展开/ }))
  expect(await projection.findByText('答复：第二条')).toBeTruthy()
  fireEvent.click(projection.getByRole('button', { name: '缩小副驾观察窗' }))
  fireEvent.click(screen.getByRole('button', { name: '打开探索终端' }))
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('collision')
})

test('opening the copilot keeps the existing orbit and material clocks and the active galaxy route running', async () => {
  let now = 1000
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (frameId: number) => frames.delete(frameId))
  const tick = () => act(() => {
    now += 20
    const current = [...frames.values()]
    frames.clear()
    current.forEach(callback => callback(now))
  })
  let lastFrame: DitherFrame
  const draw = (frame: DitherFrame) => { lastFrame = frame }
  vi.mocked(createDitherRenderer).mockReturnValue({ draw, dispose: vi.fn() })
  const { view } = setupDock(false)
  const folk = await screen.findByRole('button', { name: '前往星系 Folk' })
  const canvas = view.container.querySelector('.dither-stage canvas[data-dither-renderer]')!
  const planet = () => lastFrame.assets.find(asset => asset.id === 'planet:folk-planet')!
  // Start a sector jump but open the copilot before the camera gets there.
  fireEvent.click(folk)
  tick()
  const before = planet()
  fireEvent.click(screen.getByRole('button', { name: /舰载副驾，点按打开/ }))
  tick()
  const expanded = planet()
  expect(expanded.phase).toBeGreaterThan(before.phase!)
  expect([expanded.x, expanded.y]).not.toEqual([before.x, before.y])
  for (let i = 0; i < 30; i++) tick()
  const beforeMinimize = planet()
  fireEvent.click(screen.getByRole('button', { name: '缩小副驾观察窗' }))
  tick()
  const minimized = planet()
  expect(minimized.phase! - beforeMinimize.phase!).toBeCloseTo(expanded.phase! - before.phase!, 6)
  expect([minimized.x, minimized.y]).not.toEqual([beforeMinimize.x, beforeMinimize.y])
  expect(screen.getByRole('button', { name: '前往星系 Folk' }).getAttribute('aria-current')).toBe('step')
  expect(view.container.querySelector('.dither-stage canvas[data-dither-renderer]')).toBe(canvas)
})
