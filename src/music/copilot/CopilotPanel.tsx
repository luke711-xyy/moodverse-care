import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useCopilotVoice } from './voice'
import { desktopProviders, type DesktopStatus } from './desktop-bridge'
import { CopilotSocialPanel } from './SocialIntroductions'
import { ArchiveEntries, HistoryPanel, localDay, rangeFor, useLocalDay, type HistoryPage, type ReadHistory } from './HistoryPanel'
import './copilot.css'

export type CopilotPhase = 'idle' | 'listening' | 'thinking' | 'error'
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
  visible?: boolean
  compact?: boolean
  onMinimize?(): void
  onExpand?(): void
  onPhaseChange?(phase: CopilotPhase): void
  onNameChange?(name: string): void
  onClose?(): void
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
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', ...init,
    headers: { 'X-Mosic-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', ...init.headers },
  })
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

function CompactReply({
  message,
  progress,
  error,
  player,
}: {
  message?: CopilotMessage
  progress: string
  error: string
  player: MusicPlayerControls
}) {
  const card = message?.cards?.find((card) => card.type === 'track' && Boolean(card.track.audioUrl))
  const track = card?.type === 'track' ? card.track : undefined
  const playing = track && player.playing && player.currentTrackId === track.id
  return (
    <div className="cp-compact-reply" aria-label="当前通讯" aria-live="polite">
      {error ? (
        <p className="cp-error" role="alert">
          {error}
        </p>
      ) : progress ? (
        <p role="status">{progress}</p>
      ) : (
        <>
          <p>{message?.text || '想听什么，船长？'}</p>
          {track && (
            <button
              className="cp-compact-track"
              type="button"
              aria-label={`${playing ? '暂停' : '播放'} ${track.title}`}
              onClick={() => player.toggle(track)}
            >
              <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span> {track.title}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function CopilotPanel(props: CopilotPanelProps) {
  const { active, compact = false, visible = true } = props
  const [tab, setTab] = useState<'chat' | 'history' | 'social' | 'settings'>('chat')
  const today = useLocalDay(active)
  const pointer = useRef<number | null>(null)
  const holdKey = useRef<string | null>(null)
  const draftPrefix = useRef('')
  const [cloudState, setState] = useState<CopilotState | null>(null)
  const bridge = window.mosicDesktop
  const state = cloudState ?? (bridge ? desktopEmpty : null)
  const [desktop, setDesktop] = useState<DesktopStatus | null>(null)
  const [desktopMessages, setDesktopMessages] = useState<CopilotMessage[]>([])
  const desktopGeneration = useRef(0)
  const [desktopCursor, setDesktopCursor] = useState<string | null>(null)
  const [historyRevision, setHistoryRevision] = useState(0)
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
  const local = session.provider === 'desktop'
  const storedMessages = local ? desktopMessages : (state?.messages ?? noMessages)
  const currentMessages = useMemo(() => storedMessages.filter((message) =>
    localDay(new Date(message.createdAt)) === today), [storedMessages, today])
  const readHistory: ReadHistory = useCallback(async (range, cursor, signal) => {
    if (local) {
      if (!bridge?.history) throw new Error('请更新 Mac 客户端以查看本机通讯记录。')
      return bridge.history({ ...range, cursor })
    }
    const query = new URLSearchParams(range)
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(endpoint + '/history?' + query, { credentials: 'same-origin', cache: 'no-store', signal })
    if (!response.ok) throw new Error('无法读取通讯记录，请重试。')
    return response.json() as Promise<HistoryPage>
  }, [local, bridge])
  const [error, setError] = useState('')
  const pendingDay = useRef('')
  const pendingToday = pendingDay.current === today ? pending : ''
  const cloudPageDay = useRef('')
  const desktopPageDay = useRef('')
  const logEnd = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const isMounted = useRef(true)
  const foregroundEpoch = useRef(0)
  const callbacks = useRef(props)
  callbacks.current = props
  const voice = useCopilotVoice({
    onTranscript: (text) => {
      if (callbacks.current.visible === false || !callbacks.current.active) return
      setDraft((draftPrefix.current + text).slice(0, 1600))
    },
    onDuckChange: props.onDuckChange,
    onError: setError,
    desktopVoice: session.provider === 'desktop' ? (bridge ?? null) : undefined,
  })
  const begin = () => {
    if (!visible || busy.current || voice.phase !== 'idle') return
    setError('')
    draftPrefix.current = draft + (/[a-z0-9]$/i.test(draft) ? ' ' : '')
    voice.begin()
  }
  useEffect(() => {
    const releaseKey = (event: KeyboardEvent) => {
      if (holdKey.current !== event.key) return
      event.preventDefault()
      holdKey.current = null
      voice.end()
    }
    const releasePointer = (event: PointerEvent) => {
      if (pointer.current !== event.pointerId) return
      pointer.current = null
      voice.end()
    }
    const cancelHold = () => {
      if (holdKey.current === null && pointer.current === null) return
      holdKey.current = pointer.current = null
      voice.cancel()
    }
    window.addEventListener('keyup', releaseKey)
    window.addEventListener('pointerup', releasePointer)
    window.addEventListener('pointercancel', cancelHold)
    window.addEventListener('blur', cancelHold)
    return () => {
      window.removeEventListener('keyup', releaseKey)
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('pointercancel', cancelHold)
      window.removeEventListener('blur', cancelHold)
    }
  }, [voice.cancel, voice.end])
  const load = useCallback(async () => {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true)
    setError('')
    setState(null)
    try {
      const day = localDay()
      const next = await requestJson<CopilotState>({ signal: controller.signal })
      if (!controller.signal.aborted) {
        cloudPageDay.current = day
        setState(next)
      }
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
  }, [active, today, load])
  useEffect(() => {
    if (!active || !local || !bridge?.history) return
    let alive = true
    let readCount = 0
    const refresh = async () => {
      const token = ++readCount
      const generation = desktopGeneration.current
      try {
        const page = await bridge.history!(rangeFor(today))
        if (alive && token === readCount) {
          if (generation !== desktopGeneration.current) { void refresh(); return }
          desktopPageDay.current = today
          setDesktopMessages(page.messages)
          setDesktopCursor(page.nextCursor)
        }
      } catch {
        if (alive && token === readCount) {
          setDesktopMessages([])
          setDesktopCursor(null)
          setError('无法读取本机通讯记录，请检查桌面连接。')
        }
      }
    }
    void refresh()
    const unsubscribe = bridge.onHistoryChanged?.(() => {
      setDesktopMessages([])
      setDesktopCursor(null)
      setHistoryRevision((value) => value + 1)
      void refresh()
    })
    return () => { alive = false; unsubscribe?.() }
  }, [active, local, bridge, today])
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
      pointer.current = null
      holdKey.current = null
      setTab('chat')
    }
    wasActive.current = active
  }, [active, voice.cancel])
  useEffect(() => {
    if (visible) return
    foregroundEpoch.current++
    pointer.current = null
    holdKey.current = null
    voice.cancel()
  }, [visible, voice.cancel])
  const savedName = cloudState?.settings.name
  useEffect(() => {
    if (savedName) callbacks.current.onNameChange?.(savedName)
  }, [savedName])
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

  const send = async (text: string) => {
    text = text.trim()
    if (!text || !visible || busy.current || !state) return
    const sentInForeground = foregroundEpoch.current
    const useDesktop = session.provider === 'desktop'
    if (!useDesktop && !cloudState) {
      setError('平台通讯尚未连接，请重试。')
      return
    }
    if (!useDesktop && session.provider !== 'platform' && !session.key.trim()) {
      setError('先填写本次连接的 API 密钥，或切换到平台副驾。')
      if (compact) props.onExpand?.()
      setTab('settings')
      return
    }
    voice.cancel()
    busy.current = true
    setError('')
    pendingDay.current = localDay()
    setPending(text)
    setDraft('')
    const context = {
      trackId: props.currentTrackId,
      planetId: props.currentPlanetId,
      view: props.currentView,
    }
    const signature = JSON.stringify([text, context, session.provider, session.model])
    const id = retry.current?.signature === signature ? retry.current.id : crypto.randomUUID()
    retry.current = { signature, id }
    const controller = new AbortController()
    inFlight.current = controller
    try {
      let messages: CopilotMessage[]
      if (session.provider === 'desktop') {
        if (!bridge) throw new Error('桌面连接已关闭。')
        const status = await bridge.status()
        if (controller.signal.aborted) return
        setDesktop(status)
        if (!status.enabled) {
          if (callbacks.current.compact) callbacks.current.onExpand?.()
          setTab('settings')
          throw new Error('桌面连接尚未就绪，请打开本机模型设置。')
        }
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
        desktopGeneration.current++
        setDesktopMessages((previous) =>
          [...previous.filter((m) => !messages.some((next) => next.id === m.id)), ...messages],
        )
      } else {
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
      setHistoryRevision((v) => v + 1)
      const assistant = [...messages].reverse().find((message) => message.role === 'assistant')
      if (
        !callbacks.current.active ||
        callbacks.current.visible === false ||
        sentInForeground !== foregroundEpoch.current ||
        pendingDay.current !== localDay() ||
        !assistant
      )
        return
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
  const patch = async (change: CopilotPatch) => {
    if (busy.current) return false
    busy.current = true
    setSaving(true)
    setError('')
    try {
      const day = localDay()
      const next = await requestJson<CopilotState>({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      })
      if (!isMounted.current) return false
      cloudPageDay.current = day
      setState(next)
      return true
    } catch (caught) {
      if (isMounted.current) setError(caught instanceof Error ? caught.message : '保存失败，请重试。')
      return false
    } finally {
      busy.current = false
      if (isMounted.current) setSaving(false)
    }
  }
  const clearHistory = async () => {
    if (!local) return patch({ clearHistory: true })
    if (busy.current) return false
    busy.current = true
    setSaving(true)
    setError('')
    try {
      if (!bridge?.clearHistory) throw new Error('请更新 Mac 客户端以清空本机通讯记录。')
      await bridge.clearHistory()
      if (!isMounted.current) return false
      desktopGeneration.current++
      setDesktopMessages([])
      setDesktopCursor(null)
      return true
    } catch (caught) {
      if (isMounted.current) setError(caught instanceof Error ? caught.message : '本机通讯记录清空失败。')
      return false
    } finally {
      busy.current = false
      if (isMounted.current) setSaving(false)
    }
  }
  const [showMoreActions, setShowMoreActions] = useState<string | null>(null)
  const lastMessageId = currentMessages.at(-1)?.id
  useEffect(() => {
    const log = logEnd.current?.parentElement
    if (log && active && tab === 'chat') log.scrollTop = log.scrollHeight
  }, [active, compact, tab, lastMessageId, pendingToday])

  const phase: CopilotPhase =
    voice.phase === 'recording' || voice.phase === 'permission'
      ? 'listening'
      : pending || voice.phase === 'transcribing'
        ? 'thinking'
        : error
          ? 'error'
          : 'idle'
  useEffect(() => {
    callbacks.current.onPhaseChange?.(active ? phase : 'idle')
  }, [active, phase])
  if (!active || !visible) return null
  const latest = [...currentMessages].reverse().find((message) => message.role === 'assistant')
  const todayCursor = local
    ? desktopPageDay.current === today && desktopCursor
    : cloudPageDay.current === today && state?.nextCursor
  const listening = voice.phase === 'recording' || voice.phase === 'permission'
  const voiceWorking = voice.phase !== 'idle'
  const renderMessage = (message: CopilotMessage) => (
    <article key={message.id} className="cp-entry" data-role={message.role}>
      <header>
        <strong>{message.role === 'user' ? '你' : state?.settings.name}</strong>
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
          {props.onDraftBottle && (
            <button
              type="button"
              aria-expanded={showMoreActions === message.id}
              onClick={() =>
                setShowMoreActions(showMoreActions === message.id ? null : message.id)
              }
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
  )
  return (
    <section
      className="cp-panel cp-instrument"
      data-phase={phase}
      data-channel={compact ? 'chat' : tab}
      data-compact={compact}
      aria-label="舰载副驾"
    >
      {!compact && (
        <header className="cp-head">
          <small className="cp-model-source">
            {session.provider === 'desktop' && desktop?.enabled
              ? desktopProviders[desktop.provider]
              : sourceLabel[session.provider]}
          </small>
          {voice.phase === 'permission' && (
            <span className="cp-status" role="status">
              正在等待麦克风
            </span>
          )}
          {props.onMinimize && (
            <button
              type="button"
              className="cp-window-key cp-minimize"
              aria-label="缩小副驾观察窗"
              title="缩小，保持对话"
              onClick={() => {
                setTab('chat')
                props.onMinimize?.()
              }}
            >
              − 缩小
            </button>
          )}
          {props.onClose && (
            <button
              type="button"
              className="cp-window-key"
              aria-label="关闭副驾观察窗"
              onClick={props.onClose}
            >
              ×
            </button>
          )}
        </header>
      )}
      {!compact && (
        <nav className="cp-tabs" aria-label="副驾频道">
          {(
            [
              ['chat', '通讯'],
              ['history', '历史'],
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
                pointer.current = null
                holdKey.current = null
                setTab(key)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {error && (!compact || !state) && (
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
      {!compact && tab === 'social' && (
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
      {!compact && tab === 'settings' && state && (
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
            clearHistory={clearHistory}
            session={session}
            setSession={(next) => {
              if (!local && next.provider === 'desktop' && bridge?.history) {
                setDesktopMessages([])
                setDesktopCursor(null)
              }
              setSession(next)
              setError('')
            }}
          />
        </div>
      )}
      {!compact && tab === 'history' && state && (
        <HistoryPanel key={local ? 'desktop' : 'cloud'} today={today} read={readHistory} renderMessage={renderMessage} revision={historyRevision} />
      )}
      {(compact || tab === 'chat') && state && (
        <>
          {compact ? (
            <CompactReply
              message={latest}
              player={props.player}
              error={error}
              progress={
                pendingToday
                  ? '副驾正在回复…'
                  : voice.phase === 'permission'
                    ? '正在等待麦克风'
                    : voice.phase === 'recording'
                      ? '正在收音…'
                      : voice.phase === 'transcribing'
                        ? '正在转写…'
                        : ''
              }
            />
          ) : (
            <div className="cp-log" aria-label="当前通讯" aria-live="polite">
              {todayCursor && <ArchiveEntries key={[local, today, todayCursor].join('/')} range={rangeFor(today)}
                read={readHistory} initialCursor={todayCursor} renderMessage={renderMessage} />}
              {!currentMessages.length && !pendingToday && (
                <div className="cp-ready">
                  <p>想听什么，船长？</p>
                  <div className="cp-prompts">
                    {prompts.map((prompt) => (
                      <button
                        type="button"
                        onClick={() => {
                          voice.cancel()
                          setDraft(prompt.text)
                        }}
                        key={prompt.label}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {currentMessages.map(renderMessage)}
              {pendingToday && (
                <article className="cp-entry" data-role="user">
                  <header>
                    <strong>你</strong>
                  </header>
                  <p>{pendingToday}</p>
                </article>
              )}
              <div ref={logEnd} />
            </div>
          )}
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
                placeholder={compact ? '发给副驾…' : '输入消息，或按住说话…'}
                value={draft}
                onChange={(event) => {
                  if (voiceWorking) voice.cancel()
                  setDraft(event.target.value)
                }}
              />
            </label>
            <div className="cp-compose-actions">
              <button
                type="button"
                className="cp-intercom"
                aria-label="按住说话"
                title={
                  session.provider === 'desktop'
                    ? '按住使用 Mac 听写，松开后可编辑并发送'
                    : '按住使用设备或 MOSIC 在线听写，松开后可编辑并发送'
                }
                aria-pressed={listening}
                disabled={Boolean(pending) || saving || voice.phase === 'transcribing'}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                  if (
                    event.button !== 0 ||
                    event.isPrimary === false ||
                    pointer.current !== null ||
                    holdKey.current
                  )
                    return
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  pointer.current = event.pointerId
                  begin()
                }}
                onLostPointerCapture={(event) => {
                  if (pointer.current === event.pointerId) {
                    pointer.current = null
                    voice.end()
                  }
                }}
                onKeyDown={(event) => {
                  if (![' ', 'Enter'].includes(event.key)) return
                  event.preventDefault()
                  if (event.repeat || holdKey.current || pointer.current !== null) return
                  holdKey.current = event.key
                  begin()
                }}
              >
                {voice.phase === 'transcribing' ? '转写中' : listening ? '松开完成' : '按住说话'}
              </button>
              <button
                className="cp-send"
                disabled={!draft.trim() || Boolean(pending) || saving}
                type="submit"
              >
                发送 ↗
              </button>
            </div>
            {!compact && session.provider === 'desktop' && (
              <small>语音在 Mac 上转写，点发送后交给桌面模型。</small>
            )}
          </form>
        </>
      )}
    </section>
  )
}
