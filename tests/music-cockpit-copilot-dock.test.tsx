// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import { defaultCopilotSettings } from '../src/music/copilot/contracts'

afterEach(() => {
  cleanup()
  localStorage.removeItem('mosic-first-run-v1')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a minimized conversation receives its pending reply, sends another turn and leaves the galaxy and cockpit usable', async () => {
  localStorage.setItem('mosic-first-run-v1', 'completed')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
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
          { key: 'folk', label: 'Folk', planetCount: 0, planets: [] },
        ] })
      case '/api/music/galaxy-content':
        return Response.json({ by: 'genre', key: 'ambient', label: 'Ambient', tracks: [], status: 'local', hasMore: false })
      case '/api/me/copilot': {
        if (init?.method !== 'POST') return Response.json({
          settings: defaultCopilotSettings, messages: [], memories: [], capabilities: { platform: true, stt: false, tts: false },
        })
        const { requestId, text } = JSON.parse(String(init.body))
        turns.push(text)
        if (turns.length === 1) await firstReply.promise
        return Response.json({ requestId, memories: [], messages: [
          { id: requestId + '-user', role: 'user', text, createdAt: '2026-11-28' },
          { id: requestId + '-assistant', role: 'assistant', text: '答复：' + text, source: 'platform', createdAt: '2026-11-28' },
        ] })
      }
      default: return Response.json({ moments: [], incoming: [], outgoing: [], friends: [], groups: [] })
    }
  })

  render(<MusicApp replayFirstRunOnEntry={false} />)
  fireEvent.click(await screen.findByRole('button', { name: /舰载副驾，点按打开/ }))
  const projection = within(screen.getByRole('region', { name: '观察窗副驾投影' }))
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
