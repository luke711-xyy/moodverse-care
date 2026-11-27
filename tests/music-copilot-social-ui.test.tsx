// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopilotSocialPanel } from '../src/music/copilot/SocialIntroductions'
import type { SocialChannel } from '../src/music/copilot/social-types'
import type { MusicTrackSummary } from '../src/music-domain'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const track: MusicTrackSummary = {
  id: 't',
  title: '海面',
  artistId: 'a',
  artistName: '船客',
  genres: [],
  moodTags: [],
  durationSeconds: null,
  coverUrl: null,
  officialUrl: null,
  versionLabel: '',
}
const channel: SocialChannel = {
  profile: { mode: 'recommend', trackId: null, introduction: '', greeting: '' },
  tracks: [track],
  moments: [],
  suggestions: [],
  cards: [],
  pauses: [],
}
test('outgoing copy can be edited after drafting; publication needs a separate preview and save', async () => {
  const fetcher = vi.fn(async (_url: unknown, options: RequestInit) =>
    Response.json({ ...channel, profile: options.body ? JSON.parse(String(options.body)) : channel.profile }),
  )
  vi.stubGlobal('fetch', fetcher)
  render(<CopilotSocialPanel onVisitPlanet={() => {}} onPlayTrack={() => {}} />)
  fireEvent.change(await screen.findByLabelText('副驾可以做什么'), { target: { value: 'auto' } })
  fireEvent.change(screen.getByLabelText('允许分享的歌曲'), { target: { value: 't' } })
  fireEvent.click(screen.getByRole('button', { name: '根据已选素材起草' }))
  fireEvent.change(screen.getByLabelText('对外自我介绍'), { target: { value: '审核后的文字。' } })
  fireEvent.click(screen.getByRole('button', { name: '预览介绍卡' }))
  expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual(['GET'])
  fireEvent.click(screen.getByRole('button', { name: '确认并保存' }))
  await screen.findByText('已保存本次授权。')
  expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({
    mode: 'auto',
    trackId: 't',
    greeting: '',
    introduction: '审核后的文字。',
  })
  fireEvent.click(screen.getByRole('button', { name: '立即撤销授权' }))
  await screen.findByText('已撤销对外介绍授权。')
  expect(JSON.parse(String(fetcher.mock.calls[2][1].body))).toMatchObject({ mode: 'recommend', trackId: null })
})
test('delivered card names both copilots and dispatches human decisions to the existing visit, player and friend paths', async () => {
  const card: SocialChannel['cards'][number] = {
    id: 'c',
    status: 'delivered',
    needsApproval: false,
    peerName: '甲',
    planetId: 'p',
    common: '都有海面',
    offered: track,
    received: track,
    messages: [
      { speaker: '甲', text: '回赠海面。' },
      { speaker: '乙', text: '收到。' },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...channel, cards: [card] }) }),
  )
  const api = {
      createFriendRequest: vi.fn().mockResolvedValue({ request: { status: 'pending' } }),
      reportContent: vi.fn(),
      blockPlanet: vi.fn(),
    },
    play = vi.fn(),
    visit = vi.fn()
  render(<CopilotSocialPanel api={api} onPlayTrack={play} onVisitPlanet={visit} />)
  expect(await screen.findByText('甲的副驾')).toBeTruthy()
  expect(screen.getByText('乙的副驾')).toBeTruthy()
  fireEvent.click(screen.getByText('听《海面》'))
  expect(play).toHaveBeenCalledWith(track)
  fireEvent.click(screen.getByText('访问星球'))
  expect(visit).toHaveBeenCalledWith('p')
  expect(api.createFriendRequest).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('发送好友请求'))
  await waitFor(() => expect(api.createFriendRequest).toHaveBeenCalledWith('p'))
  expect(await screen.findByText('你已发送好友请求。')).toBeTruthy()
})
