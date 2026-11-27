import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { MusicTrackSummary } from '../../music-domain'
import type { MusicPlayerControls } from '../useMusicPlayer'
import {
  defaultCopilotSettings,
  type CopilotMessage,
  type CopilotCard,
  CopilotPatch,
  CopilotReply,
  CopilotState,
  CopilotTurn,
} from './contracts'
import { CopilotSettingsPanel, platformSession, type ModelSession } from './settings'
import { useCopilotVoice, type CopilotIntercomHandle } from './voice'
import { desktopProviders, type DesktopStatus } from './desktop-bridge'
import { CopilotSocialPanel } from './SocialIntroductions'
import './copilot.css'

export type { CopilotIntercomHandle } from './voice'
export type CopilotPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
const desktopEmpty: CopilotState = {
  settings: defaultCopilotSettings,
  memories: [],
  messages: [],
  capabilities: { platform: false, stt: false, tts: false },
}
const noMessages: CopilotMessage[] = []
type PlanetCandidate = { planetId: string; displayName: string }
export type CopilotPanelProps = {
  active: boolean
  onPhaseChange?(phase: CopilotPhase): void
  onClose?(): void
  intercomRef?: Ref<CopilotIntercomHandle>
  onDuckChange(ducked: boolean): void
  player: MusicPlayerControls
  onPlay?(track: MusicTrackSummary): void
  onVisit(planetId: string, displayName: string): void
  currentTrackId?: string
  currentPlanetId?: string
  currentView?: string
  onInitiativeChange?(level: 'quiet' | 'balanced' | 'chatty'): void
  onPlanetsChange?(items: PlanetCandidate[]): void
  onDraftBottle?(text: string): void
}
const endpoint = '/api/me/copilot'
const prompts = [
  { label: '点首歌', text: '推荐一首适合现在的歌' },
  { label: '介绍这首歌', text: '介绍正在播放的歌' },
  { label: '寻找同好', text: '找一颗可以拜访的同歌星球' },
]
const sourceLabel = {
  platform: '平台模型',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  desktop: '桌面模型',
  fallback: '曲库助手',
}
const initiative = { off: 'quiet', low: 'balanced', normal: 'chatty' } as const
async function requestJson<T>(init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', ...init })
  if (!response.ok) {
    if (response.status === 429) throw new Error('今天的配额或本轮频率已达上限，请稍后再试。')
    if (response.status === 401 || response.status === 403)
      throw new Error('连接或密钥校验失败，请检查模型设置后重试。')
    if (response.status === 409) throw new Error('上一条通讯正在处理，请稍后重试。')
    if (response.status === 400) throw new Error('内容或模型设置未通过校验，请检查后重试。')
    throw new Error('副驾暂时没有应答，请重试。')
  }
  return response.json() as Promise<T>
}

function ExchangeCard({ card, props }: { card: CopilotCard; props: CopilotPanelProps }) {
  if (card.type === 'planet')
    return (
      <article className="cp-card cp-planet">
        <span className="cp-card-icon" aria-hidden="true">
          ◎
        </span>
        <div>
          <small>公开星球</small>
          <strong>{card.displayName}</strong>
          <p>{card.reason}</p>
        </div>
        <button
          type="button"
          aria-label={`访问星球 ${card.displayName}`}
          onClick={() => props.onVisit(card.planetId, card.displayName)}
        >
          访问 ↗
        </button>
      </article>
    )
  const { track } = card
  const isPlaying = props.player.playing && props.player.currentTrackId === track.id
  return (
    <article className="cp-card">
      {track.coverUrl ? (
        <img src={track.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="cp-card-icon" aria-hidden="true">
          ♫
        </span>
      )}
      <div>
        <small>{card.source === 'audius_weekly' ? 'Audius 周榜' : 'Mosic 曲库'}</small>
        <strong>{track.title}</strong>
        <span>{track.artistName}</span>
        <p>{card.reason}</p>
      </div>
      {track.audioUrl ? (
        <button
          type="button"
          aria-label={`${isPlaying ? '暂停' : '播放'} ${track.title}`}
          onClick={() => props.player.toggle(track)}
        >
          {isPlaying ? '暂停' : '播放'}
        </button>
      ) : track.officialUrl?.startsWith('https://') ? (
        <a href={track.officialUrl} target="_blank" rel="noopener noreferrer">
          歌曲页 ↗
        </a>
      ) : (
        <small>无可用音源</small>
      )}
    </article>
  )
}

export function CopilotPanel(props: CopilotPanelProps) {
  const { active } = props
  const [tab, setTab] = useState<'chat' | 'social' | 'settings'>('chat')
  const currentTab = useRef(tab)
  currentTab.current = tab
  const gesture = useRef<{ start: number; finishing: boolean } | null>(null)
  const spaceDown = useRef(false)
  const [cloudState, setState] = useState<CopilotState | null>(null)
  const bridge = window.mosicDesktop
  const state = cloudState ?? (bridge ? desktopEmpty : null)
  const [desktop, setDesktop] = useState<DesktopStatus | null>(null)
  const [desktopMessages, setDesktopMessages] = useState<CopilotMessage[]>([])
  useEffect(() => {
    if (!active || !bridge) return
    let live = true
    const refresh = () => {
      void bridge.status().then(
        (result) => {
          if (live) setDesktop(result)
        },
        () => {
          if (live) setDesktop(null)
        },
      )
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      live = false
      window.removeEventListener('focus', refresh)
    }
  }, [active, bridge])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [session, setSession] = useState<ModelSession>(platformSession)
  const currentMessages = session.provider === 'desktop' ? desktopMessages : (state?.messages ?? noMessages)
  const [error, setError] = useState('')
  const [voiceText, setVoiceText] = useState('')
  const [history, setHistory] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const isMounted = useRef(true)
  const activeNow = useRef(active)
  activeNow.current = active
  const callbacks = useRef(props)
  callbacks.current = props
  const voice = useCopilotVoice({
    onTranscript: (text) => {
      setTab('chat')
      setVoiceText(text)
    },
    onDuckChange: props.onDuckChange,
    onError: setError,
    desktopVoice: session.provider === 'desktop' ? (bridge ?? null) : undefined,
    desktopEnabled: desktop?.enabled,
    serverSpeech: session.provider !== 'desktop' && Boolean(state?.capabilities.tts),
  })
  const begin = () => {
    setError('')
    setVoiceText('')
    setTab('chat')
    if (!busy.current) void voice.begin()
  }
  useImperativeHandle(props.intercomRef, () => ({
    begin,
    end: voice.end,
    cancel: voice.cancel,
    toggle: () => {
      setTab('chat')
      if (!busy.current) voice.toggle()
    },
  }))
  const load = useCallback(async () => {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true)
    setError('')
    setState(null)
    try {
      const next = await requestJson<CopilotState>({ signal: controller.signal })
      if (!controller.signal.aborted) setState(next)
    } catch {
      if (!controller.signal.aborted) setError('无法读取副驾记录，请重新连接。')
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null
        setLoading(false)
      }
    }
  }, [])
  useEffect(() => {
    if (active) void load()
  }, [active, load])
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [])
  const wasActive = useRef(active)
  useEffect(() => {
    if (!active && wasActive.current) {
      voice.cancel()
      if (inFlight.current) {
        inFlight.current.abort()
        inFlight.current = null
        busy.current = false
        setPending('')
        setLoading(false)
      }
      gesture.current = null
      spaceDown.current = false
      setTab('chat')
      setVoiceText('')
    }
    wasActive.current = active
  }, [active, voice.cancel])
  const lastPlanets = useRef('')
  useEffect(() => {
    if (!state) return
    callbacks.current.onInitiativeChange?.(initiative[state.settings.proactivity])
    const candidates =
      [...currentMessages].reverse().find((message) => message.cards?.some((card) => card.type === 'planet'))
        ?.cards ?? []
    const planets = candidates.flatMap((card) =>
      card.type === 'planet' ? [{ planetId: card.planetId, displayName: card.displayName }] : [],
    )
    const signature = JSON.stringify(planets)
    if (signature !== lastPlanets.current) {
      lastPlanets.current = signature
      callbacks.current.onPlanetsChange?.(planets)
    }
  }, [state, currentMessages])

  const send = async (text: string, fromVoice = false) => {
    text = text.trim()
    if (!text || busy.current || !state) return
    const useDesktop = session.provider === 'desktop'
    if (useDesktop && (!bridge || !desktop?.enabled)) {
      setError('桌面连接尚未就绪，请打开本机模型设置。')
      setTab('settings')
      if (fromVoice) setDraft(text)
      return
    }
    if (!useDesktop && !cloudState) {
      setError('平台通讯尚未连接，请重试。')
      return
    }
    if (!useDesktop && session.provider !== 'platform' && !session.key.trim()) {
      setError('先填写本次连接的 API 密钥，或切换到平台副驾。')
      setTab('settings')
      if (fromVoice) setDraft(text)
      return
    }
    voice.cancel()
    busy.current = true
    setError('')
    setPending(text)
    setHistory(false)
    if (!fromVoice) setDraft('')
    const context = { trackId: props.currentTrackId, planetId: props.currentPlanetId, view: props.currentView }
    const signature = JSON.stringify([text, context, session.provider, session.model])
    const id = retry.current?.signature === signature ? retry.current.id : crypto.randomUUID()
    retry.current = { signature, id }
    const controller = new AbortController()
    inFlight.current = controller
    try {
      let messages: CopilotMessage[]
      if (session.provider === 'desktop' && bridge) {
        controller.signal.addEventListener(
          'abort',
          () => {
            void bridge.cancel().catch(() => {})
          },
          { once: true },
        )
        const reply = await bridge.chat({ text, requestId: id, context })
        if (!isMounted.current || controller.signal.aborted) return
        if (
          reply.requestId !== id ||
          !Array.isArray(reply.messages) ||
          !reply.messages.some((m) => m.role === 'assistant' && m.source === 'desktop')
        )
          throw new Error('桌面模型返回了无效的回合。')
        messages = reply.messages
        setDesktopMessages((previous) =>
          [...previous.filter((m) => !messages.some((next) => next.id === m.id)), ...messages].slice(-40),
        )
      } else {
        if (session.provider === 'desktop') throw new Error('桌面连接已关闭。')
        const body: CopilotTurn = {
          text,
          requestId: id,
          context,
          provider: session.provider,
          ...(session.provider !== 'platform' && session.model.trim() ? { model: session.model.trim() } : {}),
        }
        const reply = await requestJson<CopilotReply>({
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(session.provider !== 'platform' ? { 'X-Mosic-Provider-Key': session.key.trim() } : {}),
          },
          body: JSON.stringify(body),
        })
        if (!isMounted.current || controller.signal.aborted) return
        messages = reply.messages
        setState((previous) =>
          previous
            ? {
                ...previous,
                memories: reply.memories,
                messages: [
                  ...previous.messages.filter((m) => !messages.some((next) => next.id === m.id)),
                  ...messages,
                ],
              }
            : previous,
        )
      }
      retry.current = null
      const assistant = [...messages].reverse().find((message) => message.role === 'assistant')
      if (!activeNow.current || !assistant) return
      const track = assistant.cards?.find(
        (card) => card.type === 'track' && card.track.id === assistant.playTrackId,
      )
      const current = callbacks.current
      const playbackUnchanged =
        current.player.currentTrackId === props.player.currentTrackId &&
        current.player.playing === props.player.playing
      if (track?.type === 'track' && track.track.audioUrl && playbackUnchanged) {
        if (current.onPlay) current.onPlay(track.track)
        else if (!current.player.playing || current.player.currentTrackId !== track.track.id)
          current.player.toggle(track.track)
      }
      if (currentTab.current === 'chat' && (fromVoice || state.settings.voiceEnabled)) void voice.speak(assistant.text)
    } catch (caught) {
      if (!isMounted.current || controller.signal.aborted) return
      setDraft((current) => current || text)
      setError(caught instanceof Error ? caught.message : '通讯中断，请重试。')
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null
        busy.current = false
        if (isMounted.current) setPending('')
      }
    }
  }
  const sendLatest = useRef(send)
  sendLatest.current = send
  useEffect(() => {
    if (voiceText && state && !loading && !inFlight.current && !busy.current && active) {
      setVoiceText('')
      void sendLatest.current(voiceText, true)
    }
  }, [voiceText, state, active, loading])

  const patch = async (change: CopilotPatch) => {
    if (busy.current) return false
    busy.current = true
    setSaving(true)
    setError('')
    try {
      const next = await requestJson<CopilotState>({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      })
      if (!isMounted.current) return false
      setState(next)
      if (change.settings?.voiceEnabled === false) voice.cancel()
      return true
    } catch (caught) {
      if (isMounted.current) setError(caught instanceof Error ? caught.message : '保存失败，请重试。')
      return false
    } finally {
      busy.current = false
      if (isMounted.current) setSaving(false)
    }
  }
  const [showMoreActions, setShowMoreActions] = useState<string | null>(null)
  useEffect(() => {
    const log = logEnd.current?.parentElement
    if (log && active && tab === 'chat' && history) log.scrollTop = log.scrollHeight
  }, [active, tab, history, state?.messages.length, pending])

  const phase: CopilotPhase =
    voice.phase === 'recording' || voice.phase === 'permission'
      ? 'listening'
      : voice.phase === 'speaking' || voice.phase === 'synthesizing'
        ? 'speaking'
        : pending || voice.phase === 'transcribing'
          ? 'thinking'
          : error
            ? 'error'
            : 'idle'
  useEffect(() => {
    callbacks.current.onPhaseChange?.(active ? phase : 'idle')
  }, [active, phase])
  if (!active) return null
  const latest = [...currentMessages].reverse().find((message) => message.role === 'assistant')
  const messages = history ? currentMessages : latest && !pending ? [latest] : []
  const listening = voice.phase === 'recording' || voice.phase === 'permission'
  const voiceWorking = voice.phase !== 'idle'
  return (
    <section className="cp-panel cp-instrument" data-phase={phase} data-channel={tab} aria-label="舰载副驾">
      <header className="cp-head">
        <small className="cp-model-source">
          {session.provider === 'desktop' && desktop?.enabled
            ? desktopProviders[desktop.provider]
            : sourceLabel[session.provider]}
        </small>
        {voice.phase === 'permission' && <span className="cp-status" role="status">正在等待麦克风</span>}
        {props.onClose && (
          <button type="button" className="cp-close" aria-label="关闭副驾观察窗" onClick={props.onClose}>
            ×
          </button>
        )}
      </header>
      <nav className="cp-tabs" aria-label="副驾频道">
        {(
          [
            ['chat', '通讯'],
            ['social', '引荐'],
            ['settings', '设置与记忆'],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            aria-pressed={tab === key}
            key={key}
            onClick={() => {
              voice.cancel()
              gesture.current = null
              spaceDown.current = false
              setVoiceText('')
              setTab(key)
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      {loading && !state && <p role="status">正在接入副驾…</p>}
      {!loading && !state && (
        <button type="button" onClick={() => void load()}>
          重新连接
        </button>
      )}
      {tab === 'social' && (
        <div className="cp-aux-scroll">
          <CopilotSocialPanel
            onVisitPlanet={(id) => props.onVisit(id, '公开星球')}
            onPlayTrack={(track) => {
              if (props.onPlay) props.onPlay(track)
              else props.player.toggle(track)
            }}
          />
        </div>
      )}
      {tab === 'settings' && state && (
        <div className="cp-aux-scroll">
          <CopilotSettingsPanel
            desktop={desktop}
            onDesktopSettings={
              bridge
                ? () => {
                    void bridge
                      .openSettings()
                      .then(() => bridge.status())
                      .then(setDesktop)
                      .catch(() => setError('无法打开本机设置。'))
                  }
                : undefined
            }
            state={state}
            busy={saving || Boolean(pending)}
            patch={patch}
            session={session}
            setSession={(next) => {
              setSession(next)
              setError('')
              setHistory(false)
            }}
          />
        </div>
      )}
      {tab === 'chat' && state && (
        <>
          {currentMessages.length > 0 && (
            <div className="cp-log-tools">
              <button onClick={() => setHistory(!history)} type="button">
                {history ? '返回当前通讯' : '查看通讯记录'}
              </button>
            </div>
          )}
          <div className="cp-log" aria-label={history ? '通讯记录' : '当前通讯'} aria-live="polite">
            {!messages.length && !pending && !history && (
              <div className="cp-ready">
                <p>想听什么，船长？</p>
                <div className="cp-prompts">
                  {prompts.map((prompt) => (
                    <button type="button" onClick={() => void send(prompt.text)} key={prompt.label}>
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages?.map((message) => (
              <article key={message.id} className="cp-entry" data-role={message.role}>
                <header>
                  <strong>{message.role === 'user' ? '你' : state.settings.name}</strong>
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  {message.source && <small>{sourceLabel[message.source]}</small>}
                </header>
                <p>{message.text}</p>
                {message.source === 'fallback' && message.fallbackReason && (
                  <small className="cp-source-note">{message.fallbackReason}</small>
                )}
                {message.cards?.map((card) => (
                  <ExchangeCard
                    key={card.type === 'planet' ? card.planetId : card.track.id}
                    card={card}
                    props={props}
                  />
                ))}
                {message.role === 'assistant' && (
                  <div className="cp-entry-actions">
                    <button
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => void voice.speak(message.text)}
                    >
                      播报
                    </button>
                    {props.onDraftBottle && (
                      <button
                        type="button"
                        aria-expanded={showMoreActions === message.id}
                        onClick={() => setShowMoreActions(showMoreActions === message.id ? null : message.id)}
                      >
                        更多
                      </button>
                    )}
                    {props.onDraftBottle && showMoreActions === message.id && (
                      <button type="button" onClick={() => props.onDraftBottle?.(message.text)}>
                        用这段话起草漂流瓶
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {pending && (
              <article className="cp-entry" data-role="user">
                <header>
                  <strong>你</strong>
                </header>
                <p>{pending}</p>
              </article>
            )}
            <div ref={logEnd} />
          </div>
          <form
            className="cp-compose"
            onSubmit={(event) => {
              event.preventDefault()
              void send(draft)
            }}
          >
            <label className="cp-draft">
              <span className="cp-visually-hidden">发给副驾</span>
              <textarea
                rows={1}
                maxLength={1600}
                placeholder="输入消息，或用对讲键说话…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault()
                    void send(draft)
                  }
                }}
              />
            </label>
            <div className="cp-compose-actions">
              <button
                type="button"
                className="cp-intercom"
                aria-label="副驾对讲"
                aria-pressed={listening}
                disabled={Boolean(pending) || saving}
                onPointerDown={(event) => {
                  if (event.button !== 0 || gesture.current) return
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  gesture.current = { start: Date.now(), finishing: listening }
                  if (listening) voice.end()
                  else begin()
                }}
                onPointerUp={() => {
                  const press = gesture.current
                  gesture.current = null
                  if (press && !press.finishing && Date.now() - press.start >= 300) voice.end()
                }}
                onPointerCancel={() => {
                  gesture.current = null
                  voice.cancel()
                }}
                onKeyDown={(event) => {
                  if (event.code === 'Space' || event.key === ' ') {
                    event.preventDefault()
                    if (!event.repeat && !spaceDown.current) {
                      spaceDown.current = true
                      begin()
                    }
                  }
                }}
                onKeyUp={(event) => {
                  if (event.code === 'Space' || event.key === ' ') {
                    event.preventDefault()
                    if (spaceDown.current) {
                      spaceDown.current = false
                      voice.end()
                    }
                  }
                }}
                onBlur={() => {
                  if (spaceDown.current) {
                    spaceDown.current = false
                    voice.cancel()
                  }
                }}
                onClick={(event) => {
                  if (event.detail === 0) {
                    setError('')
                    voice.toggle()
                  }
                }}
              >
                ● {listening ? '结束并发送' : '按住说话'}
              </button>
              {voiceWorking && (
                <button type="button" onClick={voice.cancel}>
                  {['speaking', 'synthesizing'].includes(voice.phase) ? '停止播报' : '取消对讲'}
                </button>
              )}
              <button className="cp-send" disabled={!draft.trim() || Boolean(pending) || saving} type="submit">
                发送 ↗
              </button>
            </div>
            {session.provider === 'desktop' && <small>语音在 Mac 上转写，文字指令交给你选择的桌面模型。</small>}
          </form>
        </>
      )}
    </section>
  )
}
