// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Communicator } from '../src/music/Communicator'
import { createMusicApi } from '../src/music-api'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
test('an unconfirmed friendship does not claim it ended and disables sending without losing a draft', async () => {
  let allowed=true
  const fetcher=async()=>allowed ? Response.json({messages:[]}) : Response.json({error:'FRIENDSHIP_REQUIRED'},{status:403})
  render(<Communicator api={createMusicApi(fetcher as typeof fetch)} peer={{userId:'demo:user:friend',displayName:'示例好友'}} tracks={[]} player={{playing:false,toggle(){}}} onClose={()=>{}} />)
  await screen.findByText('从一句问候，或一首歌开始。',{exact:false})
  fireEvent.change(screen.getByLabelText('发送私信'),{target:{value:'保留我的草稿'}})
  allowed=false;fireEvent.focus(window)
  const alert=await screen.findByRole('alert')
  expect(alert.textContent).not.toContain('已结束')
  expect(alert.textContent).toContain('无法确认好友关系')
  expect((screen.getByRole('button',{name:'发送'}) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByLabelText('发送私信') as HTMLTextAreaElement).value).toBe('保留我的草稿')
  allowed=true;fireEvent.focus(window)
  await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull())
  expect((screen.getByRole('button',{name:'发送'}) as HTMLButtonElement).disabled).toBe(false)
})
test('the separate communicator reads history, sends text and songs, retains failed drafts, and validates images', async () => {
  const saved: Array<Record<string, unknown>> = [{ id: 'first', contentText: '来自好友', isOwn: false, createdAt: '2026-10-10T00:00:00Z', readAt: null }]
  let fail = false
  const track = { id: 'audius:123', title: '一首歌', artistName: '歌手', audioUrl: '/sample.mp3', genres: [], moodTags: [], artistId: 'a', versionLabel: '', officialUrl: null, coverUrl: null, durationSeconds: 100 }
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/catalog')) return Response.json({ tracks: [track] })
    if (init?.method === 'POST') {
      if (fail) return Response.json({ error: 'USER_BLOCKED' }, { status: 403 })
      const body = JSON.parse(String(init.body))
      const message = { id: `sent-${saved.length}`, contentText: body.contentText || '[歌曲] 一首歌', kind: body.trackId ? 'song' : 'text', track: body.trackId ? track : undefined, createdAt: new Date().toISOString(), isOwn: true, readAt: null }
      saved.push(message); return Response.json({ message })
    }
    return Response.json({ peerUserId: 'friend', messages: saved })
  }
  const api = createMusicApi(fetcher as typeof fetch)
  render(<Communicator api={api} peer={{ userId: 'friend', displayName: '朋友' }} tracks={[track]} player={{ playing: false, toggle() {} }} onClose={() => {}} />)
  expect(await screen.findByText('来自好友')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '文字消息' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('文字消息')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '♫ 歌曲' }))
  fireEvent.click(await screen.findByRole('button', { name: '一首歌 — 歌手' }))
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('一首歌')).toBeTruthy()
  expect(saved[2]).toMatchObject({ kind: 'song', track: { id: 'audius:123' } })
  const file = new File([new Uint8Array(10 * 1024 * 1024)], 'large.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('选择私信图片'), { target: { files: [file] } })
  expect(screen.getByRole('alert').textContent).toContain('小于 10 MB')
  fail = true
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '保留草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('已被屏蔽'))
  expect((screen.getByLabelText('发送私信') as HTMLTextAreaElement).value).toBe('保留草稿')
})

test('a valid image is sent as multipart and retained until the server confirms it', async () => {
  vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:preview' } static revokeObjectURL() {} })
  let resolveUpload: (value: Response) => void = () => {}
  let uploaded: FormData | null = null
  const fetcher = async (_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') { uploaded = init.body as FormData; return new Promise<Response>(resolve => { resolveUpload = resolve }) }
    return Response.json({ messages: [] })
  }
  render(<Communicator api={createMusicApi(fetcher as typeof fetch)} peer={{ userId: 'friend', displayName: '朋友' }} tracks={[]} player={{ playing: false, toggle() {} }} onClose={() => {}} />)
  await screen.findByText('从一句问候，或一首歌开始。', { exact: false })
  fireEvent.change(screen.getByLabelText('选择私信图片'), { target: { files: [new File(['small image'], 'small.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(screen.getByAltText('待发送图片')).toBeTruthy()
  expect((uploaded as unknown as FormData).get('photo')).toBeInstanceOf(File)
  resolveUpload(Response.json({ message: { id: 'photo-1', kind: 'photo', contentText: '[图片]', photoUrl: '/api/me/messages/photo-1/photo', createdAt: new Date().toISOString(), readAt: null, isOwn: true } }))
  expect(await screen.findByAltText('好友私信图片')).toBeTruthy()
  expect(screen.queryByAltText('待发送图片')).toBeNull()
})

test('refresh merges new replies without removing loaded history or duplicating messages', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let latest = 0
  const message = (id: string, text: string, day: string) => ({ id, contentText: text, isOwn: false, readAt: null, createdAt: `2026-10-${day}T00:00:00Z` })
  const fetcher = async (input: RequestInfo | URL) => String(input).includes('?before=')
    ? Response.json({ messages: [message('old', '更早的历史', '01')], nextCursor: null })
    : Response.json({ messages: latest++ ? [message('middle', '已有消息', '02'), message('new', '新的回复', '03')] : [message('middle', '已有消息', '02')], nextCursor: 'older-cursor' })
  render(<Communicator api={createMusicApi(fetcher as typeof fetch)} peer={{ userId: 'friend', displayName: '朋友' }} tracks={[]} player={{ playing: false, toggle() {} }} onClose={() => {}} />)
  await screen.findByText('已有消息')
  fireEvent.click(screen.getByRole('button', { name: '更早的消息 ↑' }))
  await screen.findByText('更早的历史')
  fireEvent.focus(window)
  await screen.findByText('新的回复')
  expect(screen.getAllByText('已有消息')).toHaveLength(1)
  expect(screen.getByText('更早的历史')).toBeTruthy()
})
