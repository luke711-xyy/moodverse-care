// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { CopilotPanel, type CopilotPanelProps } from '../src/music/copilot/CopilotPanel'
import { defaultCopilotSettings, type CopilotReply, type CopilotState } from '../src/music/copilot/contracts'

const state: CopilotState = {
  settings: defaultCopilotSettings,
  messages: [],
  memories: [],
  capabilities: { platform: true, tts: false, stt: true },
}
const track = {
  id: 't1',
  title: '夜航',
  artistName: '海盐',
  artistId: 'a',
  versionLabel: '',
  genres: [],
  moodTags: [],
  officialUrl: null,
  coverUrl: null,
  durationSeconds: null,
  audioUrl: '/api/music/tracks/t1/stream',
}
function fixture(
  custom: Partial<CopilotPanelProps> = {},
  recent: CopilotState = state,
  replyGate?: Promise<void>,
) {
  const calls: RequestInit[] = [],
    patches: RequestInit[] = []
  const props = {
    active: true,
    onDuckChange: vi.fn(),
    onVisit: vi.fn(),
    onPlanetsChange: vi.fn(),
    onPlay: vi.fn(),
    player: { playing: false, toggle: vi.fn() },
    ...custom,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, init: RequestInit) => {
      if (String(path).endsWith('/transcribe')) return Response.json({ text: '播放夜航' })
      if (init.method === 'PATCH') {
        patches.push(init)
        return Response.json({
          ...recent,
          memories: [{ id: 'm1', text: '喜欢钢琴', kind: 'preference', expiresAt: null }],
        })
      }
      if (init.method !== 'POST') return Response.json(recent)
      const { text, requestId } = JSON.parse(String(init.body))
      calls.push(init)
      await replyGate
      const reply: CopilotReply = {
        requestId,
        memories: [],
        messages: [
          { id: 'u', role: 'user', text, createdAt: '2026-01-01' },
          {
            id: 'a',
            role: 'assistant',
            source: 'platform',
            text: '收到，夜航准备就绪。',
            createdAt: '2026-01-01',
            playTrackId: track.id,
            cards: [
              { type: 'track', track, source: 'catalog', reason: '节奏舒缓' },
              {
                type: 'planet',
                planetId: 'p1',
                displayName: '雨海',
                reason: '共同选歌',
                source: 'public_planet',
              },
            ],
          },
        ],
      }
      return Response.json(reply)
    }),
  )
  const result = render(<CopilotPanel {...props} />)
  return { calls, patches, props, result }
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a requested song can play, a suggested planet can be visited and a temporary model key stays out of storage and JSON', async () => {
  const { calls, props } = fixture()
  await screen.findByPlaceholderText('输入消息，或按住说话…')
  fireEvent.click(screen.getByRole('button', { name: '设置与记忆' }))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'openai' } })
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'test-session-key' } })
  fireEvent.click(screen.getByRole('button', { name: '通讯', exact: true }))
  fireEvent.change(screen.getByLabelText('发给副驾'), { target: { value: '播放夜航' } })
  fireEvent.click(screen.getByRole('button', { name: '发送 ↗' }))
  await screen.findByText('收到，夜航准备就绪。')
  expect(calls).toHaveLength(1)
  expect(calls[0].headers).toMatchObject({ 'X-Mosic-Provider-Key': 'test-session-key' })
  expect(calls[0].body).not.toContain('test-session-key')
  expect(JSON.stringify([localStorage, sessionStorage])).not.toContain('test-session-key')
  expect(props.onPlay).toHaveBeenCalledWith(track)
  fireEvent.click(screen.getByRole('button', { name: '访问星球 雨海' }))
  expect(props.onVisit).toHaveBeenCalledWith('p1', '雨海')
  expect(props.onPlanetsChange).toHaveBeenLastCalledWith([{ planetId: 'p1', displayName: '雨海' }])
})

test('the intercom releases a late permission grant after cancellation without transcribing', async () => {
  const stop = vi.fn()
  let allow!: (stream: MediaStream) => void
  const grant = new Promise<MediaStream>((resolve) => {
    allow = resolve
  })
  vi.stubGlobal('MediaRecorder', class {})
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia: () => grant } }),
  )
  const { calls } = fixture()
  await screen.findByLabelText('发给副驾')
  fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
  await screen.findByText('正在等待麦克风')
  fireEvent.keyUp(window, { key: ' ' })
  await act(async () => {
    allow({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await grant
  })
  expect(stop).toHaveBeenCalledTimes(1)
  expect(calls).toHaveLength(0)
})

test('browser interim text revises the dictation suffix and release leaves an editable silent draft', async () => {
  let recognizer!: LocalRecognizer
  class LocalRecognizer {
    static available = vi.fn(async () => 'available')
    onstart?: () => void
    onend?: () => void
    onresult?: (event: { results: { transcript: string }[][] }) => void
    start() {
      recognizer = this
      this.onstart?.()
    }
    stop() {
      this.onresult?.({ results: [[{ transcript: '夜航音乐' }]] })
      this.onend?.()
    }
    abort() {}
  }
  vi.stubGlobal('SpeechRecognition', LocalRecognizer)
  const speak = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak })
  const { props, calls } = fixture({}, { ...state, settings: { ...state.settings, voiceEnabled: true } })
  const button = await screen.findByRole('button', { name: '按住说话' })
  fireEvent.click(button)
  expect(LocalRecognizer.available).not.toHaveBeenCalled()
  const draft = screen.getByLabelText<HTMLTextAreaElement>('发给副驾')
  fireEvent.change(draft, { target: { value: '我想听' } })
  fireEvent.keyDown(button, { key: ' ' })
  await waitFor(() => expect(props.onDuckChange).toHaveBeenCalledWith(true))
  act(() => recognizer.onresult?.({ results: [[{ transcript: '夜行' }]] }))
  expect(draft.value).toBe('我想听夜行')
  act(() => recognizer.onresult?.({ results: [[{ transcript: '夜航' }]] }))
  expect(draft.value).toBe('我想听夜航')
  fireEvent.keyUp(window, { key: ' ' })
  expect(draft.value).toBe('我想听夜航音乐')
  expect(props.onDuckChange).toHaveBeenLastCalledWith(false)
  fireEvent.change(draft, { target: { value: '我想听爵士' } })
  fireEvent.keyDown(draft, { key: 'Enter' })
  expect(calls).toHaveLength(0)
  fireEvent.click(screen.getByText('发送 ↗'))
  await screen.findByText('收到，夜航准备就绪。')
  expect(JSON.parse(String(calls[0].body)).text).toBe('我想听爵士')
  expect(calls).toHaveLength(1)
  expect(speak).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/speech'))).toBe(false)
})

test.each([
  [429, '今日在线听写额度已用完，草稿仍可编辑。'],
  [503, '在线转写中断，草稿仍可编辑。'],
])('failed final online transcription (%i) keeps the prefix and last audible preview', async (status, message) => {
  const stop = vi.fn()
  const port = { onmessage: null as ((event: { data: Int16Array | string }) => void) | null, postMessage: () => {} }
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  }))
  vi.stubGlobal('AudioContext', class {
    audioWorklet = { addModule: async () => {} }
    resume = async () => {}
    close = async () => {}
    createMediaStreamSource = () => ({ connect() {} })
  })
  vi.stubGlobal('AudioWorkletNode', class {
    port = port
    connect() {}
    disconnect() {}
  })
  const { calls } = fixture()
  const draft = await screen.findByLabelText<HTMLTextAreaElement>('发给副驾')
  fireEvent.change(draft, { target: { value: '我想听' } })
  fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
  await screen.findByText('松开完成')
  const http = vi.mocked(fetch)
  const count = http.mock.calls.length
  await act(async () => port.onmessage?.({ data: new Int16Array(24000) }))
  expect(http.mock.calls).toHaveLength(count + 1)
  const recording = http.mock.calls.at(-1)?.[1]?.body as Blob
  expect(recording.type).toBe('audio/wav')
  expect(recording.size).toBe(44 + 24000 * 2)
  expect(draft.value).toBe('我想听播放夜航')
  http.mockResolvedValueOnce(new Response(null, { status }))
  fireEvent.keyUp(window, { key: ' ' })
  expect(stop).toHaveBeenCalledOnce()
  await act(async () => port.onmessage?.({ data: 'finished' }))
  await screen.findByText(message)
  expect(draft.value).toBe('我想听播放夜航')
  expect(calls).toHaveLength(0)
  expect(screen.getByLabelText('按住说话').getAttribute('aria-pressed')).toBe('false')
})

test('settings can add memory while retired speech controls stay absent for saved profiles', async () => {
  const { patches } = fixture(
    {},
    { ...state, messages: [{ id: 'a', role: 'assistant', text: '收到。', createdAt: '2026-01-01' }] },
  )
  await screen.findByText('收到。')
  expect(screen.queryByRole('button', { name: '播报' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '设置与记忆' }))
  expect(screen.queryByText(/也播报/)).toBeNull()
  fireEvent.change(screen.getByLabelText('添加记忆'), { target: { value: '喜欢钢琴' } })
  fireEvent.click(screen.getByRole('button', { name: '保存记忆' }))
  await waitFor(() => expect(screen.getByText('喜欢钢琴')).toBeTruthy())
  expect(JSON.parse(String(patches[0].body))).toEqual({ memory: { action: 'add', text: '喜欢钢琴' } })
})

test('a delayed play request leaves a newer manual selection in place', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const { result, props, calls } = fixture(
    { player: { playing: true, currentTrackId: 'before', toggle: vi.fn() } },
    state,
    gate,
  )
  fireEvent.change(await screen.findByLabelText('发给副驾'), { target: { value: '播放夜航' } })
  fireEvent.click(screen.getByRole('button', { name: '发送 ↗' }))
  expect(calls).toHaveLength(1)
  result.rerender(<CopilotPanel {...props} player={{ ...props.player, currentTrackId: 'manual' }} />)
  await act(async () => {
    release()
    await gate
  })
  await screen.findByText('收到，夜航准备就绪。')
  expect(props.onPlay).not.toHaveBeenCalled()
})

test('instrument shows the model and current reply, with controls for opening history and closing the sight glass', async () => {
  const onPhaseChange = vi.fn(),
    onClose = vi.fn()
  fixture(
    { onPhaseChange, onClose },
    {
      ...state,
      messages: [
        { id: 'old', role: 'assistant', text: '旧航线', createdAt: '2026-01-01' },
        { id: 'u', role: 'user', text: '新的指令', createdAt: '2026-01-02' },
        { id: 'a', role: 'assistant', text: '当前航线', createdAt: '2026-01-02' },
      ],
    },
  )
  await screen.findByText('当前航线')
  expect(screen.queryByText('旧航线')).toBeNull()
  expect(screen.queryByText('待命')).toBeNull()
  expect(screen.getByText('平台模型')).toBeTruthy()
  expect(screen.getByLabelText('舰载副驾').classList.contains('cp-instrument')).toBe(true)
  fireEvent.click(screen.getByText('查看通讯记录'))
  expect(screen.getByText('旧航线')).toBeTruthy()
  fireEvent.click(screen.getByText('返回当前通讯'))
  expect(screen.queryByText('旧航线')).toBeNull()
  fireEvent.click(screen.getByLabelText('关闭副驾观察窗'))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onPhaseChange).toHaveBeenCalledWith('idle')
})

test('desktop requires an explicit selection and sends only the current turn to its bridge, with no web fallback', async () => {
  let finish!: () => void
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const chat = vi.fn(async ({ text, requestId }: { text: string; requestId: string }) => {
    if (text === '故障') throw new Error('桌面模型离线')
    await gate
    return {
      requestId,
      messages: [
        { id: 'lu', role: 'user', text, createdAt: '2026-11-28' },
        {
          id: 'la',
          role: 'assistant',
          source: 'desktop',
          text: '本机私有回复',
          createdAt: '2026-11-28',
          cards: [],
        },
      ],
    }
  })
  const bridge = {
    chat,
    cancel: vi.fn(),
    status: vi.fn(async () => ({ enabled: true, provider: 'local', model: 'demo-local' })),
    openSettings: vi.fn(async () => {}),
  }
  vi.stubGlobal('mosicDesktop', bridge)
  const onPhaseChange = vi.fn()
  const { calls, patches } = fixture(
    { currentTrackId: 'song', onPhaseChange },
    {
      ...state,
      memories: [{ id: 'm', kind: 'mood', text: '私密偏好', expiresAt: null }],
      messages: [{ id: 'u1', role: 'user', text: '平台的旧记录', createdAt: '2026-11-20' }],
    },
  )
  fireEvent.click(await screen.findByRole('button', { name: '设置与记忆' }))
  expect(screen.getByLabelText<HTMLSelectElement>('本次连接').value).toBe('platform')
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'desktop' } })
  expect(await screen.findByText('本地模型 · demo-local')).toBeTruthy()
  fireEvent.click(screen.getByText('打开本机模型设置'))
  expect(bridge.openSettings).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('通讯'))
  fireEvent.change(screen.getByLabelText('发给副驾'), { target: { value: '点歌' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  await waitFor(() => expect(onPhaseChange).toHaveBeenCalledWith('thinking'))
  expect(chat).toHaveBeenCalledTimes(1)
  expect(Object.keys(chat.mock.calls[0][0]).sort()).toEqual(['context', 'requestId', 'text'])
  expect(JSON.stringify(chat.mock.calls)).not.toMatch(/私密偏好|平台的旧记录/)
  await act(async () => {
    finish()
    await gate
  })
  await screen.findByText('本机私有回复')
  fireEvent.change(screen.getByLabelText('发给副驾'), { target: { value: '故障' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  await screen.findByText('桌面模型离线')
  expect(calls).toEqual([])
  expect(patches).toEqual([])
  fireEvent.click(screen.getByText('设置与记忆'))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'platform' } })
  fireEvent.click(screen.getByText('通讯'))
  expect(screen.queryByText('本机私有回复')).toBeNull()
})
test('desktop native voice bypasses network transcription and uses the same desktop chat turn', async () => {
  type Event = { type: 'ready' | 'text'; text?: string }
  let handler: ((event: Event) => void) | undefined
  const chat = vi.fn(async ({ text, requestId }: { text: string; requestId: string }) => ({
    requestId,
    messages: [
      { id: 'x', role: 'assistant', source: 'desktop', text: '本机收到' + text, createdAt: '2026-11-27' },
    ],
  }))
  const bridge = {
    chat,
    cancel: vi.fn(async () => {}),
    status: async () => ({ enabled: true, provider: 'local', model: 'local' }),
    openSettings: vi.fn(),
    voiceStart: vi.fn(async () => {
      handler?.({ type: 'ready' })
    }),
    voiceFinish: vi.fn(async () => handler?.({ type: 'text', text: '从本机出发' })),
    voiceCancel: vi.fn(async () => {}),
    onVoice: (fn: (event: Event) => void) => {
      handler = fn
      return () => {
        handler = undefined
      }
    },
  }
  vi.stubGlobal('mosicDesktop', bridge)
  const { calls, props } = fixture()
  fireEvent.click(await screen.findByText('设置与记忆'))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'desktop' } })
  fireEvent.click(screen.getByText('通讯'))
  expect(bridge.voiceStart).not.toHaveBeenCalled()
  const button = screen.getByLabelText('按住说话')
  fireEvent.keyDown(button, { key: ' ', code: 'Space' })
  await waitFor(() => expect(props.onDuckChange).toHaveBeenCalledWith(true))
  fireEvent.keyUp(button, { key: ' ', code: 'Space' })
  expect(screen.getByLabelText<HTMLTextAreaElement>('发给副驾').value).toBe('从本机出发')
  expect(chat).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('发送 ↗'))
  await screen.findByText('本机收到从本机出发')
  expect(bridge.voiceStart).toHaveBeenCalledOnce()
  expect(bridge.voiceFinish).toHaveBeenCalledOnce()
  expect(chat).toHaveBeenCalledOnce()
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/transcribe'))).toBe(false)
  expect(calls).toHaveLength(0)
})

test.each([{ active: false }, { visible: false }])(
  'leaving the projection (%j) releases a pending browser mic grant before resuming',
  async (change) => {
    const stop = vi.fn()
    let grant!: (stream: MediaStream) => void
    vi.stubGlobal('MediaRecorder', class {})
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        mediaDevices: {
          getUserMedia: () =>
            new Promise<MediaStream>((resolve) => {
              grant = resolve
            }),
        },
      }),
    )
    const { calls, result, props } = fixture()
    await screen.findByLabelText('发给副驾')
    fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
    await screen.findByText('正在等待麦克风')
    result.rerender(<CopilotPanel {...props} {...change} />)
    await act(async () => grant({ getTracks: () => [{ stop }] } as unknown as MediaStream))
    expect(stop).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('舰载副驾')).toBeNull()
    result.rerender(<CopilotPanel {...props} />)
    await screen.findByText('想听什么，船长？')
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/transcribe'))).toBe(false)
    expect(calls).toHaveLength(0)
  },
)

test('desktop voice permission errors stay local and leaving the channel discards late transcription', async () => {
  type VoiceEvent = { type: 'ready' | 'text' | 'error'; text?: string; message?: string }
  let deliver!: (event: VoiceEvent) => void
  const stop = vi.fn(async () => {})
  const start = vi
    .fn(async () => {
      deliver({ type: 'ready' })
    })
    .mockRejectedValueOnce(new Error('microphone denied'))
  const chat = vi.fn()
  vi.stubGlobal('mosicDesktop', {
    status: async () => ({ enabled: true, provider: 'local', model: 'demo' }),
    openSettings: vi.fn(),
    chat,
    cancel: vi.fn(),
    voiceStart: start,
    voiceCancel: stop,
    voiceFinish: vi.fn(),
    onVoice: (fn: (event: VoiceEvent) => void) => {
      deliver = fn
      return () => {}
    },
  })
  const webMicrophone = vi.fn()
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia: webMicrophone } }),
  )
  const { calls } = fixture()
  fireEvent.click(await screen.findByText('设置与记忆'))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'desktop' } })
  fireEvent.click(screen.getByText('通讯'))
  fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
  await screen.findByText('Mac 未能开始听写，可以输入文字。')
  fireEvent.keyUp(window, { key: ' ' })
  fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
  await waitFor(() => expect(screen.getByLabelText('按住说话').getAttribute('aria-pressed')).toBe('true'))
  fireEvent.click(screen.getByText('设置与记忆'))
  expect(stop).toHaveBeenCalledTimes(2)
  act(() => deliver({ type: 'text', text: '过期听写' }))
  expect(screen.getByLabelText('本次连接')).toBeTruthy()
  expect(webMicrophone).not.toHaveBeenCalled()
  expect(chat).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/transcribe'))).toBe(false)
})

test('closing a desktop request sends cancellation and old replies cannot update the reopened panel', async () => {
  let respond!: (reply: unknown) => void
  const chat = vi.fn(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  const cancel = vi.fn(async () => {})
  vi.stubGlobal('mosicDesktop', {
    status: async () => ({ enabled: true, provider: 'local', model: 'demo' }),
    openSettings: vi.fn(),
    chat,
    cancel,
  })
  const { result, props, calls } = fixture()
  fireEvent.click(await screen.findByText('设置与记忆'))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'desktop' } })
  fireEvent.click(screen.getByText('通讯'))
  fireEvent.change(screen.getByLabelText('发给副驾'), { target: { value: '一个慢请求' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  await waitFor(() => expect(chat).toHaveBeenCalledOnce())
  result.rerender(<CopilotPanel {...props} active={false} />)
  expect(cancel).toHaveBeenCalledOnce()
  result.rerender(<CopilotPanel {...props} />)
  await screen.findByText('想听什么，船长？')
  await act(async () =>
    respond({ messages: [{ role: 'assistant', source: 'desktop', text: '已取消的回复' }] }),
  )
  expect(screen.queryByText('已取消的回复')).toBeNull()
  expect(calls).toHaveLength(0)
  expect(props.onPlay).not.toHaveBeenCalled()
})

test('minimizing settings keeps a draft and exposes the saved callsign without duplicating the full controls', async () => {
  const onMinimize = vi.fn()
  const onNameChange = vi.fn()
  const { props, result } = fixture(
    { onMinimize, onNameChange },
    {
      ...state,
      settings: { ...state.settings, name: '小航' },
    },
  )
  const draft = await screen.findByLabelText<HTMLTextAreaElement>('发给副驾')
  fireEvent.change(draft, { target: { value: '航线草稿' } })
  await waitFor(() => expect(onNameChange).toHaveBeenCalledWith('小航'))
  fireEvent.click(screen.getByText('设置与记忆'))
  fireEvent.click(screen.getByRole('button', { name: '缩小副驾观察窗' }))
  expect(onMinimize).toHaveBeenCalledOnce()
  result.rerender(<CopilotPanel {...props} compact />)
  expect(screen.queryByRole('navigation', { name: '副驾频道' })).toBeNull()
  expect(screen.queryByText('平台模型')).toBeNull()
  expect(screen.getByLabelText<HTMLTextAreaElement>('发给副驾').value).toBe('航线草稿')
  result.rerender(<CopilotPanel {...props} />)
  expect(screen.getByLabelText<HTMLTextAreaElement>('发给副驾').value).toBe('航线草稿')
})

test('a turn sent from the full panel finishes in compact chat and its inline track remains playable', async () => {
  let finish!: () => void
  const reply = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { result, props, calls } = fixture({}, state, reply)
  fireEvent.change(await screen.findByLabelText('发给副驾'), { target: { value: '播放夜航' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  result.rerender(<CopilotPanel {...props} compact />)
  await screen.findByText('副驾正在回复…')
  expect(calls[0].signal?.aborted).toBe(false)
  await act(async () => {
    finish()
    await reply
  })
  await screen.findByText('收到，夜航准备就绪。')
  expect(screen.queryByText('公开星球')).toBeNull()
  expect(screen.queryByText('查看通讯记录')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '播放 夜航' }))
  expect(props.player.toggle).toHaveBeenCalledWith(track)
  fireEvent.change(screen.getByLabelText('发给副驾'), { target: { value: '再来一首' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  await waitFor(() => expect(calls).toHaveLength(2))
  await act(async () => {})
  result.rerender(<CopilotPanel {...props} />)
  expect(screen.getByRole('button', { name: '访问星球 雨海' })).toBeTruthy()
})

test('the same desktop recording survives minimization and keyboard release leaves a corrected editable draft in compact chat', async () => {
  type VoiceEvent = { type: 'ready' | 'partial' | 'text'; text?: string }
  let deliver!: (event: VoiceEvent) => void
  let enabled = false
  const voiceCancel = vi.fn(async () => {})
  const status = vi.fn(async () => ({ enabled, provider: 'local', model: 'demo' }))
  const chat = vi.fn(async ({ requestId, text }: { requestId: string; text: string }) => ({
    requestId,
    messages: [{ id: 'one', role: 'assistant', source: 'desktop', text, createdAt: '2026-11-27' }],
  }))
  vi.stubGlobal('mosicDesktop', {
    status,
    openSettings: vi.fn(),
    chat,
    cancel: vi.fn(),
    voiceStart: async () => deliver({ type: 'ready' }),
    voiceFinish: async () => deliver({ type: 'text', text: '从小窗发送' }),
    voiceCancel,
    onVoice: (fn: (event: VoiceEvent) => void) => {
      deliver = fn
      return () => {}
    },
  })
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ lang: 'zh-CN', localService: true }],
    speak: vi.fn(),
    cancel: vi.fn(),
  })
  vi.stubGlobal('SpeechSynthesisUtterance', class {})
  const { result, props, calls } = fixture()
  fireEvent.click(await screen.findByText('设置与记忆'))
  fireEvent.change(screen.getByLabelText('本次连接'), { target: { value: 'desktop' } })
  await screen.findByText('请在本机模型设置中选择模型，并允许驾驶舱连接。')
  enabled = true
  fireEvent.click(screen.getByText('通讯'))
  fireEvent.keyDown(screen.getByLabelText('按住说话'), { key: ' ' })
  await waitFor(() => expect(props.onDuckChange).toHaveBeenCalledWith(true))
  result.rerender(<CopilotPanel {...props} compact />)
  await screen.findByText('正在收音…')
  expect(voiceCancel).not.toHaveBeenCalled()
  act(() => deliver({ type: 'partial', text: '从小窗' }))
  expect(screen.getByLabelText<HTMLTextAreaElement>('发给副驾').value).toBe('从小窗')
  fireEvent.keyUp(window, { key: ' ' })
  expect(screen.getByLabelText<HTMLTextAreaElement>('发给副驾').value).toBe('从小窗发送')
  expect(chat).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('发送 ↗'))
  await waitFor(() => expect(chat).toHaveBeenCalledOnce())
  expect(chat).toHaveBeenCalledOnce()
  expect(status.mock.calls.length).toBeGreaterThan(1)
  expect(calls).toHaveLength(0)
})

test('hidden navigation keeps an ongoing written reply and suppresses playback when the chat becomes visible again', async () => {
  let finish!: () => void
  const reply = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { result, props, calls } = fixture(
    { compact: true },
    {
      ...state,
      settings: { ...state.settings, voiceEnabled: true },
    },
    reply,
  )
  fireEvent.change(await screen.findByLabelText('发给副驾'), { target: { value: '播放夜航' } })
  fireEvent.click(screen.getByText('发送 ↗'))
  result.rerender(<CopilotPanel {...props} visible={false} />)
  expect(screen.queryByLabelText('舰载副驾')).toBeNull()
  expect(calls[0].signal?.aborted).toBe(false)
  result.rerender(<CopilotPanel {...props} />)
  await act(async () => {
    finish()
    await reply
  })
  await screen.findByText('收到，夜航准备就绪。')
  expect(props.onPlay).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/speech'))).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
})
