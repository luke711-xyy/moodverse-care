import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { GalaxyGroupBy, MusicAdminReport, MusicApi, MusicDirectMessage, MusicDiscoveryResponse, MusicDriftBottleDetail, MusicDriftBottlesResponse, MusicFriendRequestsResponse, MusicFriendSatellite, MusicGalaxyResponse, MusicMoment, MusicOrbitResponse, MusicPlanet, MusicPlanetVisitSource, MusicPlanetVisual, MusicReportQueueFilter, MusicReportReason, MusicReportStatus, MusicReportTarget, MusicSocialSettings, PublicMusicPlanet, SongPortalMatch, SongPortalResponse } from '../music-api'
import { createMusicApi, MusicApiError } from '../music-api'
import { togglePlanetTrack, validatePlanetDraft } from '../music-app-domain'
import type { MusicTrackSummary } from '../music-domain'
import { buildMusicGalaxySceneSystems } from './galaxy-scene'
import { advanceJourney, getSelfArrivalJourneyDuration, getSelfArrivalJourneyProgress, getSelfReturnJourneyProgress, getTourAnchorProgress, normalizeWheelDelta, reachesTourHomeEndpoint, SELF_RETURN_CLOUD_DURATION_MS, SELF_RETURN_TOUR_DURATION_MS, TOUR_END } from '../universe'
import type { Planet } from '../types'
import './music-app.css'

type HomeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tracks: MusicTrackSummary[]; planet: MusicPlanet | null; moments: MusicMoment[]; friendSatellites: MusicFriendSatellite[] }

type ComposerStatus = 'idle' | 'pending' | 'ready' | 'unavailable' | 'failed' | 'delayed'

type SongPortalState =
  | { status: 'idle' }
  | { status: 'loading'; track: MusicTrackSummary }
  | { status: 'ready'; track: MusicTrackSummary; response: SongPortalResponse }
  | { status: 'error'; track: MusicTrackSummary; message: string }

type ProductView = 'planet' | 'galaxy' | 'roam' | 'orbit' | 'bottles' | 'settings' | 'moderation'

type GalaxyState =
  | { status: 'idle' }
  | { status: 'loading'; by: GalaxyGroupBy; previous?: MusicGalaxyResponse }
  | { status: 'ready'; by: GalaxyGroupBy; response: MusicGalaxyResponse; selectedGroupKey: string | null }
  | { status: 'error'; by: GalaxyGroupBy }

type DiscoveryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: MusicDiscoveryResponse }
  | { status: 'error' }

type OrbitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: MusicOrbitResponse }
  | { status: 'error' }

type ConversationState =
  | { status: 'closed' }
  | { status: 'loading'; userId: string; displayName: string }
  | { status: 'ready'; userId: string; displayName: string; messages: MusicDirectMessage[] }
  | { status: 'error'; userId: string; displayName: string }

type MomentManagementState =
  | { status: 'idle' }
  | { status: 'editing'; momentId: string; contentText: string; visibility: MusicMoment['visibility']; busy: boolean; error: string }
  | { status: 'confirm-delete'; momentId: string; busy: boolean; error: string }

const PLANET_PREVIEW: MusicPlanetVisual = {
  schemaVersion: 2,
  summary: '等待三首歌为它点亮第一层色彩。',
  palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' },
  atmosphere: 'starlit',
  motion: 'drift',
  particleDensity: .34,
  terrainFeatures: { mountainRanges: 3, basins: 1, canyons: 2, escarpments: 1 },
}

const MUSIC_AUTH_CHANNEL = 'moodverse-music-auth'
const MUSIC_AUTH_STORAGE_KEY = 'moodverse-music-auth-change'

function validVisual(value: unknown): value is MusicPlanetVisual {
  if (typeof value !== 'object' || value === null) return false
  const visual = value as Partial<MusicPlanetVisual>
  const isHexColor = (color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
  const validLegacySchema = visual.schemaVersion === 1
  const validCurrentTerrain = visual.schemaVersion === 2
    && typeof visual.terrainFeatures === 'object'
    && visual.terrainFeatures !== null
    && Number.isInteger(visual.terrainFeatures.mountainRanges)
    && visual.terrainFeatures.mountainRanges >= 0 && visual.terrainFeatures.mountainRanges <= 6
    && Number.isInteger(visual.terrainFeatures.basins)
    && visual.terrainFeatures.basins >= 0 && visual.terrainFeatures.basins <= 4
    && Number.isInteger(visual.terrainFeatures.canyons)
    && visual.terrainFeatures.canyons >= 0 && visual.terrainFeatures.canyons <= 5
    && Number.isInteger(visual.terrainFeatures.escarpments)
    && visual.terrainFeatures.escarpments >= 0 && visual.terrainFeatures.escarpments <= 4
  return (validLegacySchema || validCurrentTerrain)
    && typeof visual.summary === 'string'
    && visual.summary.length <= 280
    && isHexColor(visual.palette?.surface)
    && isHexColor(visual.palette?.ocean)
    && isHexColor(visual.palette?.accent)
    && ['clear', 'mist', 'nebula', 'starlit'].includes(String(visual.atmosphere))
    && ['still', 'drift', 'flow', 'pulse'].includes(String(visual.motion))
    && typeof visual.particleDensity === 'number'
    && Number.isFinite(visual.particleDensity)
    && visual.particleDensity >= 0
    && visual.particleDensity <= 1
}

function visualFor(planet: MusicPlanet | null): MusicPlanetVisual {
  return planet && validVisual(planet.visual) ? planet.visual : PLANET_PREVIEW
}

function toScenePlanet(planet: MusicPlanet | null, previewSeed: string): Planet {
  const visual = visualFor(planet)
  return {
    id: planet?.id ?? `music-preview-${previewSeed || 'empty'}`,
    alias: planet?.displayName ?? '正在等待歌声的星球',
    tagline: planet?.tagline ?? '',
    visualSeed: planet?.id ?? (previewSeed || 'moodverse-music-preview'),
    theme: 'music',
    mood: 'calm',
    intensity: 3,
    message: planet?.tagline ?? '',
    position: [0, 0, 0],
    orbit: .4,
    owner: true,
    visualOverride: {
      surface: visual.palette.surface,
      ocean: visual.palette.ocean,
      accent: visual.palette.accent,
      atmosphere: visual.atmosphere,
      motion: visual.motion,
      particleDensity: visual.particleDensity,
      terrainFeatures: visual.terrainFeatures,
    },
  }
}

function BrandMark() {
  return <span className="brand-lockup"><span className="brand-orb" aria-hidden="true"><i /></span><strong>MOODVERSE</strong></span>
}

function BrandHeader({ connected, view, onChangeView }: { connected: boolean; view?: ProductView; onChangeView?: (view: ProductView) => void }) {
  return <header className="music-topbar">
    <BrandMark />
    {connected && onChangeView && <nav className="music-main-nav" aria-label="主导航">
      <button type="button" aria-pressed={view === 'planet'} onClick={() => onChangeView('planet')}>我的星球</button>
      <button type="button" aria-pressed={view === 'galaxy'} onClick={() => onChangeView('galaxy')}>Galaxy</button>
      <button type="button" aria-pressed={view === 'roam'} onClick={() => onChangeView('roam')}>随机漫游</button>
      <button type="button" aria-pressed={view === 'bottles'} onClick={() => onChangeView('bottles')}>漂流瓶</button>
      <button type="button" aria-pressed={view === 'orbit'} onClick={() => onChangeView('orbit')}>My Orbit</button>
      <button type="button" aria-pressed={view === 'settings'} onClick={() => onChangeView('settings')}>设置</button>
    </nav>}
    <div className="music-topbar-actions">
      <a className="music-legacy-link" href="/?legacy=1">经典星球版</a>
      <span className={`music-access-status${connected ? ' is-connected' : ''}`}><i />{connected ? '匿名体验账号' : '匿名体验'}</span>
    </div>
  </header>
}

const reportReasonOptions: Array<{ value: MusicReportReason; label: string }> = [
  { value: 'spam', label: '垃圾或刷屏' },
  { value: 'harassment', label: '骚扰或攻击' },
  { value: 'inappropriate', label: '不适宜内容' },
  { value: 'privacy', label: '隐私问题' },
  { value: 'copyright', label: '版权或来源问题' },
  { value: 'other', label: '其他' },
]

const reportStatusLabels: Record<MusicReportQueueFilter, string> = {
  open: '待处理',
  reviewing: '处理中',
  actioned: '已处置',
  dismissed: '已驳回',
  all: '全部状态',
}

const reportReasonLabels: Record<MusicReportReason, string> = {
  spam: '垃圾信息',
  harassment: '骚扰或霸凌',
  inappropriate: '不当内容',
  privacy: '隐私问题',
  copyright: '版权问题',
  other: '其他',
}

function ReportControl({ api, target, ariaLabel }: { api: MusicApi; target: MusicReportTarget; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<MusicReportReason>('inappropriate')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.reportContent(target, reason, detail.trim())
      setOpen(false)
      setFeedback('举报已提交，感谢提醒。')
    } catch (cause) {
      if (cause instanceof MusicApiError && cause.status === 409) setError('这条内容已经举报过了。')
      else if (cause instanceof MusicApiError && cause.status === 429) setError('今天的举报次数已到上限，请明天再试。')
      else setError('举报暂时没有提交，请稍后重试。')
    } finally { setBusy(false) }
  }

  return <div className="music-report-control">
    {!open && !feedback && <button className="music-text-button music-report-trigger" type="button" aria-label={ariaLabel} onClick={() => { setOpen(true); setError('') }}>举报</button>}
    {open && <form className="music-report-form" onSubmit={(event) => { void submit(event) }}>
      <label>举报原因
        <select aria-label="举报原因" value={reason} onChange={(event) => setReason(event.target.value as MusicReportReason)}>
          {reportReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>补充说明（可选）
        <textarea aria-label="补充说明（可选）" value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={500} />
      </label>
      {error && <p className="music-form-error" role="alert">{error}</p>}
      <div className="music-report-actions">
        <button className="music-text-button" type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
        <button className="music-secondary-button" type="submit" disabled={busy}>{busy ? '正在提交…' : '提交举报'}</button>
      </div>
    </form>}
    {feedback && <p className="music-report-feedback" role="status">{feedback}</p>}
  </div>
}

class SceneErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <div className="music-scene-degraded" role="status">
      <span>3D 星球暂不可用，仍可继续选歌、浏览内容和使用社交功能。</span>
      <button className="music-text-button" type="button" onClick={this.props.onRetry}>重试 3D 画面</button>
    </div>
    return this.props.children
  }
}

function supportsWebGL2() {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' })
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

type MusicSceneMode = 'self' | 'home-galaxy' | 'universe' | 'galaxy' | 'planet'
type MusicCameraTransition = 'galaxy-to-tour' | 'home-to-planet'

const GALAXY_TO_TOUR_CAMERA_DURATION_MS = 720
const HOME_PLANET_APPROACH_CAMERA_DURATION_MS = 980

function MusicPortalOverlay({ portal, returning }: { portal: number; returning: boolean }) {
  const opacity = Math.sin(Math.max(0, Math.min(1, portal)) * Math.PI)
  if (opacity < 0.015) return null
  const caption = returning
    ? '正在回到宇宙'
    : portal < .38
      ? '星系巡游完成 · 前方进入星云'
      : '正在抵达 · 你的星球'
  return <div className="portal-layer" aria-hidden="true" style={{ '--portal': opacity } as CSSProperties}>
    <div className="portal-caption">{caption}</div>
  </div>
}

function MusicGalaxyAxis({ systems, journey, onSelect, onHome }: {
  systems: ReturnType<typeof buildMusicGalaxySceneSystems>
  journey: number
  onSelect: (index: number) => void
  onHome: () => void
}) {
  const progress = systems.length ? Math.max(0, Math.min(1, journey / TOUR_END)) : 0
  const currentIndex = Math.round(progress * Math.max(0, systems.length - 1))
  if (!systems.length) return null
  const current = systems[currentIndex]
  return <div className="music-galaxy-axis" style={{ '--axis-color': current.color } as CSSProperties}>
    <div className="music-galaxy-axis-label" aria-live="polite">正在观测 · {current.label}</div>
    <div className="music-galaxy-axis-scroll" role="group" aria-label="Galaxy 星系导航">
      <div className="music-galaxy-axis-track" style={{ '--axis-track-width': `${Math.max(100, systems.length * 31 + 44)}px` } as CSSProperties}>
        <i style={{ transform: `scaleX(${progress})` }} />
        {systems.map((system, index) => <button
          type="button" key={system.id} title={`星系 · ${system.label}`}
          aria-label={`前往星系 ${system.label}`} aria-current={index === currentIndex ? 'step' : undefined}
          className={index === currentIndex ? 'is-current' : index < currentIndex ? 'is-passed' : ''}
          style={{ '--node-color': system.color } as CSSProperties}
          onClick={() => onSelect(index)}
        ><span /></button>)}
        <button type="button" className="music-galaxy-axis-home" aria-label="穿过星云回到我的星球" title="我的星球" onClick={onHome}><span>✦</span></button>
      </div>
    </div>
  </div>
}

function MusicGalaxyFooter({ label, color, onBack }: { label: string; color: string; onBack: () => void }) {
  return <div className="music-galaxy-footer" style={{ '--axis-color': color } as CSSProperties}>
    <div>星系 · {label}</div>
    <button type="button" onClick={onBack}>← 回到宇宙</button>
  </div>
}

function Stage({ planet, friendSatellites, visitedPlanet, previewSeed, reducedMotion, productView, focusedGalaxy, galaxySystems, galaxyRotation, routeJourney, regrouping, onSelectGalaxy, onOpenPlanet, onRotate }: {
  planet: MusicPlanet | null
  friendSatellites: MusicFriendSatellite[]
  visitedPlanet: PublicMusicPlanet | null
  previewSeed: string
  reducedMotion: boolean
  productView: ProductView
  focusedGalaxy?: string
  galaxySystems: ReturnType<typeof buildMusicGalaxySceneSystems>
  galaxyRotation: number
  routeJourney: number
  regrouping: boolean
  onSelectGalaxy: (id: string) => void
  onOpenPlanet: (planet: Planet, galaxyId: string) => void
  onRotate: (delta: number) => void
}) {
  const ownerScenePlanet = useMemo(() => toScenePlanet(planet, previewSeed), [planet, previewSeed])
  const visitorScenePlanet = useMemo(() => visitedPlanet ? toScenePlanet(visitedPlanet, visitedPlanet.id) : undefined, [visitedPlanet])
  const visual = visualFor(visitedPlanet ?? planet)
  const [sceneAttempt, setSceneAttempt] = useState(0)
  const [sceneMode, setSceneMode] = useState<MusicSceneMode>('self')
  const [journey, setJourney] = useState(0)
  const [traveling, setTraveling] = useState(false)
  const [selfReturning, setSelfReturning] = useState(false)
  const [cameraTransition, setCameraTransition] = useState<MusicCameraTransition | null>(null)
  const [cameraTransitionProgress, setCameraTransitionProgress] = useState(0)
  const journeyRef = useRef(0)
  const lastFocusedGalaxy = useRef<string | undefined>(undefined)
  const lastVisitorScenePlanet = useRef<Planet | undefined>(undefined)
  const desiredMode: MusicSceneMode = productView === 'galaxy'
    ? visitedPlanet ? 'planet' : focusedGalaxy ? 'galaxy' : 'universe'
    : 'self'
  const previousMode = useRef<MusicSceneMode>('self')
  const transitionToken = useRef(0)
  const dragX = useRef<number | null>(null)
  useEffect(() => {
    if (focusedGalaxy) lastFocusedGalaxy.current = focusedGalaxy
  }, [focusedGalaxy])
  useEffect(() => {
    if (visitorScenePlanet) lastVisitorScenePlanet.current = visitorScenePlanet
  }, [visitorScenePlanet])
  const setJourneyProgress = useCallback((next: number) => {
    journeyRef.current = next
    setJourney(next)
  }, [])
  useLayoutEffect(() => {
    const from = previousMode.current
    previousMode.current = desiredMode
    const token = ++transitionToken.current
    let frame = 0
    let cancelled = false
    const animate = (start: number, end: number, durationMs: number) => new Promise<void>((resolve) => {
      if (durationMs <= 0 || reducedMotion || typeof window.requestAnimationFrame !== 'function') {
        setJourneyProgress(end)
        resolve()
        return
      }
      const startedAt = performance.now()
      const tick = (now: number) => {
        if (cancelled || token !== transitionToken.current) { resolve(); return }
        const progress = Math.min(1, (now - startedAt) / durationMs)
        const eased = progress * progress * (3 - 2 * progress)
        setJourneyProgress(start + (end - start) * eased)
        if (progress >= 1) resolve()
        else frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    })
    const animateJourney = (durationMs: number, sample: (elapsedMs: number) => number) => new Promise<void>((resolve) => {
      if (durationMs <= 0 || reducedMotion || typeof window.requestAnimationFrame !== 'function') {
        setJourneyProgress(sample(durationMs))
        resolve()
        return
      }
      const startedAt = performance.now()
      const tick = (now: number) => {
        if (cancelled || token !== transitionToken.current) { resolve(); return }
        const elapsed = Math.min(durationMs, Math.max(0, now - startedAt))
        setJourneyProgress(sample(elapsed))
        if (elapsed >= durationMs) resolve()
        else frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    })
    const animateCameraTransition = (kind: MusicCameraTransition, durationMs: number) => new Promise<void>((resolve) => {
      setCameraTransition(kind)
      setCameraTransitionProgress(0)
      if (durationMs <= 0 || reducedMotion || typeof window.requestAnimationFrame !== 'function') {
        setCameraTransitionProgress(1)
        resolve()
        return
      }
      const startedAt = performance.now()
      const tick = (now: number) => {
        if (cancelled || token !== transitionToken.current) { resolve(); return }
        const progress = Math.min(1, (now - startedAt) / durationMs)
        setCameraTransitionProgress(progress * progress * (3 - 2 * progress))
        if (progress >= 1) resolve()
        else frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    })
    const run = async () => {
      if (desiredMode === 'universe' && from === 'self' && planet) {
        setTraveling(true)
        setSelfReturning(true)
        setSceneMode('home-galaxy')
        setJourneyProgress(1)
        const duration = reducedMotion ? 0 : SELF_RETURN_CLOUD_DURATION_MS + SELF_RETURN_TOUR_DURATION_MS
        await animateJourney(duration, (elapsed) => getSelfReturnJourneyProgress(1, elapsed))
        if (cancelled) return
        setSceneMode('universe')
        setJourneyProgress(0)
        setSelfReturning(false)
        setTraveling(false)
        return
      }
      if (desiredMode === 'self' && from !== 'self' && planet) {
        setTraveling(true)
        setSelfReturning(false)
        const departureGalaxyId = focusedGalaxy ?? lastFocusedGalaxy.current
        const departureGalaxyIndex = departureGalaxyId
          ? galaxySystems.findIndex((system) => system.id === departureGalaxyId)
          : -1
        const startingJourney = departureGalaxyIndex >= 0
          ? getTourAnchorProgress(departureGalaxyIndex, galaxySystems.length) * TOUR_END
          : routeJourney
        if ((from === 'galaxy' || from === 'planet') && departureGalaxyId) {
          setJourneyProgress(startingJourney)
          await animateCameraTransition('galaxy-to-tour', reducedMotion ? 0 : GALAXY_TO_TOUR_CAMERA_DURATION_MS)
          if (cancelled) return
        }
        setCameraTransition(null)
        setSceneMode('universe')
        const start = Math.max(0, Math.min(1, startingJourney))
        setJourneyProgress(start)
        const duration = getSelfArrivalJourneyDuration(start, reducedMotion)
        await animateJourney(duration, (elapsed) => getSelfArrivalJourneyProgress(start, elapsed, reducedMotion))
        if (cancelled) return
        setSceneMode('home-galaxy')
        await animate(1, 1, reducedMotion ? 0 : 220)
        if (cancelled) return
        setSceneMode('self')
        await animateCameraTransition('home-to-planet', reducedMotion ? 0 : HOME_PLANET_APPROACH_CAMERA_DURATION_MS)
        if (cancelled) return
        setCameraTransition(null)
        setTraveling(false)
        return
      }
      setSelfReturning(false)
      setCameraTransition(null)
      setSceneMode(desiredMode)
      if (desiredMode === 'universe' && !planet) setJourneyProgress(0)
    }
    void run()
    return () => {
      cancelled = true
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
    }
  }, [desiredMode, planet, reducedMotion, routeJourney, setJourneyProgress])

  useEffect(() => {
    if (!traveling && productView === 'galaxy' && sceneMode === 'universe') setJourneyProgress(Math.min(TOUR_END, routeJourney))
  }, [productView, routeJourney, sceneMode, traveling, setJourneyProgress])

  const canRenderScene = useMemo(() => supportsWebGL2(), [sceneAttempt])
  const SceneCanvas = useMemo(() => lazy(() => import('../scene').then(({ UniverseCanvas }) => ({ default: UniverseCanvas }))), [sceneAttempt])
  const journeyState = advanceJourney(journey, 0)
  const portalVeil = Math.sin(journeyState.portalProgress * Math.PI)
  return <>
    <div className="music-scene-wrap" aria-hidden="true">
      {sceneMode !== 'universe' && <div className="music-fallback-planet" style={{ '--surface-color': visual.palette.surface, '--ocean-color': visual.palette.ocean, '--accent-color': visual.palette.accent } as CSSProperties} />}
    </div>
    {canRenderScene ? <SceneErrorBoundary key={sceneAttempt} onRetry={() => setSceneAttempt((attempt) => attempt + 1)}>
      <div className={`music-scene-canvas${regrouping ? ' is-regrouping' : ''}`} style={{ filter: `blur(${portalVeil * 3.5 + (regrouping ? 7 : 0)}px) saturate(${regrouping ? .72 : 1})` }} aria-hidden="true"
        onPointerDown={(event) => { if (sceneMode === 'galaxy' && event.button === 0) dragX.current = event.clientX }}
        onPointerMove={(event) => { if (dragX.current !== null) { const delta = event.clientX - dragX.current; dragX.current = event.clientX; onRotate(delta * .006) } }}
        onPointerUp={() => { dragX.current = null }} onPointerCancel={() => { dragX.current = null }} onLostPointerCapture={() => { dragX.current = null }}>
        <Suspense fallback={null}>
          <SceneCanvas
            view={sceneMode}
            focusedThemes={[]}
            musicGalaxySystems={galaxySystems}
            focusedMusicGalaxyId={cameraTransition === 'galaxy-to-tour' ? focusedGalaxy ?? lastFocusedGalaxy.current : focusedGalaxy}
            onMusicGalaxyClick={onSelectGalaxy}
            onMusicPlanetClick={onOpenPlanet}
            ownPlanet={ownerScenePlanet}
            ownPlanets={planet ? [ownerScenePlanet] : []}
            friendSatellites={friendSatellites}
            starAppearance={{ color: visual.palette.accent }}
            selectedPlanet={sceneMode === 'planet'
              ? visitorScenePlanet ?? (cameraTransition === 'galaxy-to-tour' ? lastVisitorScenePlanet.current : undefined)
              : sceneMode === 'self' ? ownerScenePlanet : undefined}
            galaxyRotation={sceneMode === 'universe' ? 0 : galaxyRotation}
            selfReturning={selfReturning}
            scriptedJourney={traveling}
            cinematicTransition={cameraTransition}
            cinematicTransitionProgress={cameraTransitionProgress}
            journey={sceneMode === 'universe' && productView === 'galaxy' ? Math.min(TOUR_END, journey) : journey}
            reducedMotion={reducedMotion}
            onBillboardClick={() => undefined}
            onPublicBillboardClick={() => undefined}
            onArriveSelf={() => undefined}
            onThemeClick={() => undefined}
            onPlanetClick={() => undefined}
            onOwnPlanetClick={() => undefined}
            onOwnEmbryoClick={() => undefined}
            onStarClick={() => undefined}
          />
        </Suspense>
      </div>
    </SceneErrorBoundary> : <div className="music-scene-degraded" role="status">
      <span>3D 星球暂不可用，仍可继续选歌、浏览内容和使用社交功能。</span>
      <button className="music-text-button" type="button" onClick={() => setSceneAttempt((attempt) => attempt + 1)}>重试 3D 画面</button>
    </div>}
    <MusicPortalOverlay portal={journeyState.portalProgress} returning={selfReturning} />
  </>
}

function errorMessage(error: unknown) {
  if (!(error instanceof MusicApiError)) return '暂时无法连接星际档案库。请稍后再试。'
  if (error.code === 'PLANET_ALREADY_EXISTS') return '你的星球已经创建好了。正在重新读取它。'
  if (error.code === 'UNKNOWN_OR_INACTIVE_TRACK') return '有歌曲已从曲库下架，请重新选择仍可用的曲目。'
  if (error.status === 401) return '本机匿名身份暂不可用，请刷新页面后重试。'
  return '保存没有完成，已保留当前填写内容。请检查连接后重试。'
}

function isDemoTrack(track: Pick<MusicTrackSummary, 'id' | 'isDemo'>) {
  // The ID prefix keeps the demo marker visible when a selected track is loaded
  // from planet/Moment APIs that intentionally omit catalog-provider details.
  return track.isDemo === true || track.id.startsWith('demo:')
}

function matchDescription(match: SongPortalMatch) {
  if (match.reasonCode === 'shared_selection_and_moment') return '也主动选入了这首歌，并留下公开 Moment'
  if (match.reasonCode === 'shared_public_moment') return '在公开 Moment 中选择了这首歌'
  return '主动把这首歌选进了星球'
}

function portalErrorMessage(error: unknown) {
  if (error instanceof MusicApiError && error.status === 401) return '本机匿名身份暂不可用，请刷新页面后重试。'
  if (error instanceof MusicApiError && error.status === 403) return '这首歌还没有出现在你的星球或公开 Moment 中。'
  return '同歌通道暂时没有响应，请稍后重试。'
}

function galaxyReason(reasonCode: 'same_song' | 'same_artist' | 'same_genre') {
  if (reasonCode === 'same_song') return '同一首已公开选入的歌曲'
  if (reasonCode === 'same_artist') return '同一艺人'
  return '同一曲风'
}

function discoveryReason(reasonCode: MusicDiscoveryResponse['recommendations'][number]['reasonCode']) {
  if (reasonCode === 'semantic_profile') return '歌曲资料与公开 Moment 的整体语义探索'
  if (reasonCode === 'similar_genre') return '曲风相近'
  if (reasonCode === 'similar_mood') return '音乐情绪标签相近'
  if (reasonCode === 'similar_moment') return '公开 Moment 的文字氛围相近'
  return '随机路过'
}

function driftBottleStatus(status: string) {
  if (status === 'unread') return '待打开 · 一小时内未打开会重新投递'
  if (status === 'read') return '已打开 · 读后可选择继续放流'
  if (status === 'delivered') return '正在漂流'
  if (status === 'waiting_for_release') return '已读 · 等待收件人主动放流'
  if (status === 'waiting') return '暂时没有合适的接收人，系统会继续寻找'
  if (status === 'unavailable') return '内容已不可用，漂流已停止'
  if (status === 'stopped') return '漂流已停止'
  return status
}

function DriftBottlePanel({ api, tracks, moments, onVisitPlanet }: {
  api: MusicApi
  tracks: MusicTrackSummary[]
  moments: MusicMoment[]
  onVisitPlanet: (planetId: string, displayName: string) => void
}) {
  const [snapshot, setSnapshot] = useState<MusicDriftBottlesResponse | null>(null)
  const [detail, setDetail] = useState<MusicDriftBottleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [topicType, setTopicType] = useState<'song' | 'info' | 'moment'>('song')
  const [trackId, setTrackId] = useState('')
  const [momentId, setMomentId] = useState('')
  const [infoTitle, setInfoTitle] = useState('')
  const [infoUrl, setInfoUrl] = useState('')
  const [infoSummary, setInfoSummary] = useState('')
  const [messageText, setMessageText] = useState('')
  const [commentText, setCommentText] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const reload = async () => {
    setLoading(true)
    setError('')
    try { setSnapshot(await api.loadDriftBottles()) }
    catch { setError('暂时无法读取漂流瓶，请稍后重试。') }
    finally { setLoading(false) }
  }

  useEffect(() => { void reload() }, [api])
  useEffect(() => {
    if (!trackId && tracks[0]) setTrackId(tracks[0].id)
    if (!momentId) setMomentId(moments.find((moment) => moment.visibility === 'public' && moment.publishedAt)?.id ?? '')
  }, [tracks, moments, trackId, momentId])

  const createBottle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!snapshot || snapshot.sentToday || sending) return
    let topic: { type: 'song'; trackId: string } | { type: 'info'; title: string; url: string; summary: string } | { type: 'moment'; momentId: string }
    if (topicType === 'song') topic = { type: 'song', trackId }
    else if (topicType === 'moment') topic = { type: 'moment', momentId }
    else topic = { type: 'info', title: infoTitle, url: infoUrl, summary: infoSummary }
    setSending(true)
    setError('')
    setFeedback('')
    try {
      const result = await api.createDriftBottle(topic, messageText)
      setMessageText('')
      setInfoTitle('')
      setInfoUrl('')
      setInfoSummary('')
      setFeedback(result.bottle.status === 'waiting'
        ? '漂流瓶已保存，暂时没有合适的接收人；系统会继续寻找。'
        : '漂流瓶已交给系统随机投递。你可以在下方查看传播状态。')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error && 'code' in cause && cause.code === 'DAILY_BOTTLE_LIMIT'
        ? '今天已经发过一只漂流瓶了，明天可以再发。'
        : '漂流瓶没有发出，请确认内容后重试。')
    } finally { setSending(false) }
  }

  const openBottle = async (bottleId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.updateDriftBottle(bottleId, 'open')
      setDetail(await api.getDriftBottle(bottleId))
      setCommentText('')
      await reload()
    } catch {
      setError('这只漂流瓶已过期、停止传播或暂时无法打开。')
      setDetail(null)
      await reload()
    } finally { setBusy(false) }
  }

  const releaseBottle = async () => {
    if (!detail || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.updateDriftBottle(detail.bottle.id, 'release')
      setDetail(null)
      setFeedback(result.status === 'waiting'
        ? '你已放流；系统暂时没有找到下一位，会继续寻找。'
        : '你已放流，漂流瓶正在寻找下一位。')
      await reload()
    } catch { setError('放流没有完成，请刷新后重试。') }
    finally { setBusy(false) }
  }

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail || !commentText.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const { comment } = await api.addDriftBottleComment(detail.bottle.id, commentText)
      setDetail({ ...detail, comments: [...detail.comments, comment] })
      setCommentText('')
    } catch { setError('评论没有保存，请稍后重试。') }
    finally { setBusy(false) }
  }

  const toggleLike = async (commentId: string, liked: boolean) => {
    if (!detail || busy) return
    setBusy(true)
    try {
      const result = await api.setDriftBottleCommentLike(detail.bottle.id, commentId, !liked)
      setDetail({ ...detail, comments: detail.comments.map((comment) => comment.id === commentId
        ? { ...comment, likedByMe: result.liked, likeCount: result.likeCount } : comment) })
    } catch { setError('点赞没有更新，请重试。') }
    finally { setBusy(false) }
  }

  const deleteComment = async (commentId: string) => {
    if (!detail || busy) return
    setBusy(true)
    try {
      await api.deleteDriftBottleComment(detail.bottle.id, commentId)
      setDetail({ ...detail, comments: detail.comments.filter((comment) => comment.id !== commentId) })
    } catch { setError('评论没有删除，请稍后重试。') }
    finally { setBusy(false) }
  }

  const toggleReceiving = async (allowDriftBottles: boolean) => {
    setPreferenceBusy(true)
    setError('')
    try {
      await api.updateSocialSettings({ allowDriftBottles })
      setSnapshot((current) => current ? { ...current, allowReceiving: allowDriftBottles } : current)
    } catch { setError('接收偏好没有保存，请稍后重试。') }
    finally { setPreferenceBusy(false) }
  }

  const momentOptions = moments.filter((moment) => moment.visibility === 'public' && Boolean(moment.publishedAt))

  return <aside className="music-panel music-drift-panel" aria-label="漂流瓶">
    <div className="music-panel-head"><div><span className="music-kicker">每天最多一只 · 接收随机发生</span><h2>漂流瓶</h2></div></div>
    <p className="music-panel-note">选择歌曲、资讯或已公开的 Moment。瓶子会随机交给一位合适的星主；收件人读后可以评论、点赞，再决定是否继续放流。</p>
    {error && <p className="music-form-error" role="alert">{error}</p>}
    {feedback && <p className="music-feedback" role="status">{feedback}</p>}

    <form className="music-bottle-form" onSubmit={(event) => { void createBottle(event) }}>
      <div className="music-section-heading"><h3>放出一只瓶</h3><span>{snapshot?.date ?? '…'} · 每日 1 只</span></div>
      <label htmlFor="music-bottle-topic">漂流主题</label>
      <select id="music-bottle-topic" value={topicType} onChange={(event) => setTopicType(event.target.value as typeof topicType)}>
        <option value="song">一首歌曲</option><option value="info">一则资讯</option><option value="moment">一篇 Moment</option>
      </select>
      {topicType === 'song' && <>
        <label htmlFor="music-bottle-song">选择曲目</label>
        <select id="music-bottle-song" value={trackId} onChange={(event) => setTrackId(event.target.value)} required>
          {tracks.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.artistName}</option>)}
        </select>
        {!tracks.length && <p className="music-moments-empty">曲库暂时没有可用歌曲。</p>}
      </>}
      {topicType === 'info' && <>
        <label htmlFor="music-bottle-info-title">资讯标题</label><input id="music-bottle-info-title" value={infoTitle} onChange={(event) => setInfoTitle(event.target.value)} maxLength={160} required />
        <label htmlFor="music-bottle-info-url">来源链接</label><input id="music-bottle-info-url" type="url" value={infoUrl} onChange={(event) => setInfoUrl(event.target.value)} placeholder="https://…" required />
        <label htmlFor="music-bottle-info-summary">安全摘要（不复制全文）</label><textarea id="music-bottle-info-summary" value={infoSummary} onChange={(event) => setInfoSummary(event.target.value)} maxLength={800} />
      </>}
      {topicType === 'moment' && <>
        <label htmlFor="music-bottle-moment">选择一篇已公开 Moment</label>
        <select id="music-bottle-moment" value={momentId} onChange={(event) => setMomentId(event.target.value)} required>
          {momentOptions.map((moment) => <option key={moment.id} value={moment.id}>{moment.track.title} · {moment.contentText.slice(0, 42) || '公开 Moment'}</option>)}
        </select>
        {!momentOptions.length && <p className="music-moments-empty">还没有可分享的公开 Moment；私密内容不会通过漂流瓶传播。</p>}
      </>}
      <label htmlFor="music-bottle-message">附上一句话 <span>{messageText.length}/500</span></label>
      <textarea id="music-bottle-message" value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={500} placeholder="留一小段给下一个遇见的人……" />
      <button className="music-primary-button" type="submit" disabled={sending || !snapshot || snapshot.sentToday || (topicType === 'song' && !trackId) || (topicType === 'moment' && !momentId)}>
        {sending ? '正在放流…' : snapshot?.sentToday ? '今日已放流' : '放出漂流瓶 ↗'}
      </button>
      {snapshot?.sentToday && <small className="music-bottle-limit-note">每天最多新发一只；收件数量不保证，也不会每日强制分配。</small>}
    </form>

    <label className="music-visit-incognito music-bottle-preference">
      <input type="checkbox" checked={snapshot?.allowReceiving ?? true} disabled={preferenceBusy || !snapshot} onChange={(event) => { void toggleReceiving(event.target.checked) }} />
      <span><strong>接收漂流瓶</strong><small>关闭后不会收到新的投递；已收到的瓶仍可处理。</small></span>
    </label>

    {detail ? <section className="music-bottle-detail" aria-label="漂流瓶内容">
      <div className="music-section-heading"><div><span className="music-kicker">瓶中来信 · 已打开</span><h3>{detail.bottle.topic.type === 'song' ? '一首歌曲' : detail.bottle.topic.type === 'info' ? '一则资讯' : '一篇 Moment'}</h3></div>
        <button className="music-close-inline" type="button" aria-label="关闭漂流瓶详情" onClick={() => setDetail(null)}>×</button></div>
      {detail.bottle.topic.type === 'song' && <div className="music-bottle-topic-card">
        <strong>{detail.bottle.topic.track?.title ?? '歌曲资料暂不可用'}</strong>
        <span>{detail.bottle.topic.track?.artistName}{detail.bottle.topic.track?.versionLabel ? ` · ${detail.bottle.topic.track.versionLabel}` : ''}</span>
        {detail.bottle.topic.track?.officialUrl && <a href={detail.bottle.topic.track.officialUrl} target="_blank" rel="noreferrer">在官方平台打开 ↗</a>}
      </div>}
      {detail.bottle.topic.type === 'info' && <div className="music-bottle-topic-card"><strong>{detail.bottle.topic.title}</strong><p>{detail.bottle.topic.summary}</p><a href={detail.bottle.topic.url} target="_blank" rel="noreferrer">查看来源 ↗</a></div>}
      {detail.bottle.topic.type === 'moment' && <div className="music-bottle-topic-card"><strong>{detail.bottle.topic.track?.title ?? 'Moment'}</strong><span>{detail.bottle.topic.track?.artistName}</span><p>{detail.bottle.topic.contentText}</p></div>}
      {detail.bottle.messageText && <blockquote>{detail.bottle.messageText}</blockquote>}
      {detail.bottle.sender && <button className="music-text-button" type="button" onClick={() => onVisitPlanet(detail.bottle.sender!.planetId, detail.bottle.sender!.displayName)}>访问瓶主星球 · {detail.bottle.sender.displayName} ↗</button>}
      <ReportControl api={api} target={{ type: 'drift_bottle', id: detail.bottle.id }} ariaLabel="举报这只漂流瓶" />
      <section className="music-bottle-comments" aria-label="漂流瓶评论">
        <div className="music-section-heading"><h4>接力留言</h4><span>{detail.comments.length}</span></div>
        {!detail.comments.length ? <p className="music-moments-empty">还没有评论，你可以留下一句回应。</p> : detail.comments.map((comment) => <article className="music-bottle-comment" key={comment.id}>
          <div><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time></div>
          <p>{comment.contentText}</p>
          <div className="music-bottle-comment-actions">
            <button className="music-text-button" type="button" disabled={busy} aria-pressed={comment.likedByMe} onClick={() => { void toggleLike(comment.id, comment.likedByMe) }}>{comment.likedByMe ? '已赞' : '点赞'} · {comment.likeCount}</button>
            {comment.isOwn && <button className="music-text-button" type="button" disabled={busy} onClick={() => { void deleteComment(comment.id) }}>删除</button>}
          </div>
          {!comment.isOwn && <ReportControl api={api} target={{ type: 'drift_comment', id: comment.id }} ariaLabel="举报这条漂流瓶评论" />}
        </article>)}
        <form className="music-bottle-comment-form" onSubmit={(event) => { void submitComment(event) }}>
          <label htmlFor="music-bottle-comment">添加评论</label>
          <textarea id="music-bottle-comment" value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={500} placeholder="你想把什么留给下一个人？" />
          <button className="music-secondary-button" type="submit" disabled={busy || !commentText.trim()}>留下评论</button>
        </form>
      </section>
      <button className="music-primary-button music-release-button" type="button" disabled={busy} onClick={() => { void releaseBottle() }}>{busy ? '正在处理…' : '继续放流 ↗'}</button>
      <p className="music-panel-note">如果不继续放流，瓶子会停留在这里，不会自动无限传播。</p>
    </section> : <>
      {loading && <p className="music-moments-empty" role="status">正在寻找传来的漂流瓶…</p>}
      {!loading && snapshot?.inbox.length === 0 && <p className="music-moments-empty">今天还没有漂流瓶来到这里；收瓶由系统随机决定。</p>}
      {snapshot?.inbox.map((bottle) => <article className="music-bottle-inbox-card" key={bottle.id}>
        <div><span className="music-kicker">{bottle.status === 'unread' ? '新抵达' : '已打开'}</span><strong>{bottle.topicLabel}</strong><small>{new Date(bottle.deliveredAt).toLocaleString('zh-CN')}</small></div>
        <button className="music-secondary-button" type="button" disabled={busy} onClick={() => { void openBottle(bottle.id) }}>{bottle.status === 'read' ? '继续阅读' : '打开漂流瓶'}</button>
      </article>)}
      <section className="music-bottle-sent">
        <div className="music-section-heading"><h3>我放出的瓶</h3><span>{snapshot?.sent.length ?? 0}</span></div>
        {snapshot?.sent.length === 0 ? <p className="music-moments-empty">你放出的瓶及接力状态会显示在这里。</p> : snapshot?.sent.map((bottle) => <article className="music-bottle-sent-item" key={bottle.id}>
          <div><strong>{bottle.topicLabel}</strong><small>{new Date(bottle.createdAt).toLocaleString('zh-CN')} · 已接力 {bottle.deliveryCount} 次</small></div><span>{driftBottleStatus(bottle.status)}</span>
        </article>)}
      </section>
    </>}
    {!snapshot && !loading && <button className="music-text-button" type="button" onClick={() => { void reload() }}>重新加载</button>}
  </aside>
}

function MusicApp() {
  const [api] = useState(() => createMusicApi())
  const [home, setHome] = useState<HomeState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [tagline, setTagline] = useState('')
  const [planetPrivate, setPlanetPrivate] = useState(false)
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([])
  const [draftError, setDraftError] = useState('')
  const [creatingPlanet, setCreatingPlanet] = useState(false)
  const [composerStatus, setComposerStatus] = useState<ComposerStatus>('idle')
  const [composerTaskId, setComposerTaskId] = useState<string>()
  const [momentTrackId, setMomentTrackId] = useState('')
  const [momentText, setMomentText] = useState('')
  const [momentPrivate, setMomentPrivate] = useState(false)
  const [savingMoment, setSavingMoment] = useState(false)
  const [momentFeedback, setMomentFeedback] = useState('')
  const [momentManagement, setMomentManagement] = useState<MomentManagementState>({ status: 'idle' })
  const [reducedMotion, setReducedMotion] = useState(false)
  const [songPortal, setSongPortal] = useState<SongPortalState>({ status: 'idle' })
  const [view, setView] = useState<ProductView>('planet')
  const [galaxy, setGalaxy] = useState<GalaxyState>({ status: 'idle' })
  const [galaxyJourney, setGalaxyJourney] = useState(0)
  const galaxyJourneyRef = useRef(galaxyJourney)
  galaxyJourneyRef.current = galaxyJourney
  const [galaxyRotation, setGalaxyRotation] = useState(0)
  const [galaxyRegrouping, setGalaxyRegrouping] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: 'idle' })
  const [orbit, setOrbit] = useState<OrbitState>({ status: 'idle' })
  const [socialSettings, setSocialSettings] = useState<MusicSocialSettings | null>(null)
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaving, setSettingsSaving] = useState('')
  const [moderatorAvailable, setModeratorAvailable] = useState(false)
  const [moderationFilter, setModerationFilter] = useState<MusicReportQueueFilter>('open')
  const [moderationStatus, setModerationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [moderationReports, setModerationReports] = useState<MusicAdminReport[]>([])
  const [moderationHasMore, setModerationHasMore] = useState(false)
  const [moderationBusyId, setModerationBusyId] = useState('')
  const [moderationError, setModerationError] = useState('')
  const [planetEditName, setPlanetEditName] = useState('')
  const [planetEditTagline, setPlanetEditTagline] = useState('')
  const [planetEditTrackIds, setPlanetEditTrackIds] = useState<string[]>([])
  const [planetEditPrimaryTrackId, setPlanetEditPrimaryTrackId] = useState('')
  const [planetEditQuery, setPlanetEditQuery] = useState('')
  const [planetEditError, setPlanetEditError] = useState('')
  const [planetEditFeedback, setPlanetEditFeedback] = useState('')
  const [friendRequests, setFriendRequests] = useState<MusicFriendRequestsResponse | null>(null)
  const [friendSatelliteBusyId, setFriendSatelliteBusyId] = useState('')
  const [friendSatelliteError, setFriendSatelliteError] = useState('')
  const [friendSatelliteFeedback, setFriendSatelliteFeedback] = useState('')
  const [socialError, setSocialError] = useState('')
  const [socialFeedback, setSocialFeedback] = useState('')
  const [socialBusyId, setSocialBusyId] = useState('')
  const [conversation, setConversation] = useState<ConversationState>({ status: 'closed' })
  const [messageDraft, setMessageDraft] = useState('')
  const [messageError, setMessageError] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [momentsLoadError, setMomentsLoadError] = useState(false)
  const [blockingPlanetId, setBlockingPlanetId] = useState('')
  const [visitedPlanet, setVisitedPlanet] = useState<PublicMusicPlanet | null>(null)
  const [pendingVisit, setPendingVisit] = useState<{ planetId: string; displayName: string; source: MusicPlanetVisitSource; trackId?: string } | null>(null)
  const [incognitoVisit, setIncognitoVisit] = useState(false)
  const [visitingPlanetId, setVisitingPlanetId] = useState('')
  const [visitError, setVisitError] = useState('')
  const visitDialogRef = useRef<HTMLElement>(null)
  const accountEpoch = useRef(0)
  const moderationRequestId = useRef(0)
  const tabId = useRef(`${Date.now()}-${Math.random()}`)
  const seenAuthEvents = useRef(new Set<string>())

  const resetAccountScopedState = useCallback(() => {
    accountEpoch.current += 1
    setHome({ status: 'loading' })
    setView('planet')
    setQuery('')
    setDisplayName('')
    setTagline('')
    setPlanetPrivate(false)
    setSelectedTrackIds([])
    setDraftError('')
    setCreatingPlanet(false)
    setComposerStatus('idle')
    setComposerTaskId(undefined)
    setMomentTrackId('')
    setMomentText('')
    setMomentPrivate(false)
    setSavingMoment(false)
    setMomentFeedback('')
    setMomentManagement({ status: 'idle' })
    setSongPortal({ status: 'idle' })
    setGalaxy({ status: 'idle' })
    setGalaxyJourney(0)
    setGalaxyRotation(0)
    setGalaxyRegrouping(false)
    setDiscovery({ status: 'idle' })
    setOrbit({ status: 'idle' })
    setSocialSettings(null)
    setSettingsStatus('idle')
    setSettingsError('')
    setSettingsSaving('')
    moderationRequestId.current += 1
    setModeratorAvailable(false)
    setModerationFilter('open')
    setModerationStatus('idle')
    setModerationReports([])
    setModerationHasMore(false)
    setModerationBusyId('')
    setModerationError('')
    setPlanetEditName('')
    setPlanetEditTagline('')
    setPlanetEditTrackIds([])
    setPlanetEditPrimaryTrackId('')
    setPlanetEditQuery('')
    setPlanetEditError('')
    setPlanetEditFeedback('')
    setFriendRequests(null)
    setFriendSatelliteBusyId('')
    setFriendSatelliteError('')
    setFriendSatelliteFeedback('')
    setSocialError('')
    setSocialFeedback('')
    setSocialBusyId('')
    setConversation({ status: 'closed' })
    setMessageDraft('')
    setMessageError('')
    setSendingMessage(false)
    setMomentsLoadError(false)
    setBlockingPlanetId('')
    setVisitedPlanet(null)
    setPendingVisit(null)
    setIncognitoVisit(false)
    setVisitingPlanetId('')
    setVisitError('')
  }, [])

  const reloadHome = useCallback(async () => {
    const epoch = accountEpoch.current
    setHome({ status: 'loading' })
    try {
      const { tracks, planet, friendSatellites } = await api.loadHome()
      let moments: MusicMoment[] = []
      let failedToLoadMoments = false
      if (planet) {
        try {
          moments = await api.loadMoments()
        } catch {
          failedToLoadMoments = true
        }
      }
      if (epoch !== accountEpoch.current) return
      setMomentsLoadError(failedToLoadMoments)
      setHome({ status: 'ready', tracks, planet, moments, friendSatellites })
      if (planet) {
        setMomentTrackId(planet.tracks.find((track) => track.isPrimary)?.id ?? planet.tracks[0]?.id ?? '')
        setComposerStatus(validVisual(planet.visual) ? 'ready' : 'idle')
      }
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setHome({ status: 'error' })
    }
  }, [api])

  const reloadMoments = async () => {
    const epoch = accountEpoch.current
    try {
      const moments = await api.loadMoments()
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready' ? { ...current, moments } : current)
      setMomentsLoadError(false)
    } catch {
      if (epoch !== accountEpoch.current) return
      setMomentsLoadError(true)
    }
  }

  useEffect(() => { void reloadHome() }, [reloadHome])
  useEffect(() => {
    const sessionChanged = () => {
      resetAccountScopedState()
      void reloadHome()
    }
    const receiveAuthEvent = (value: unknown) => {
      if (typeof value !== 'object' || value === null
        || !('type' in value) || value.type !== 'session-changed'
        || !('sourceId' in value) || typeof value.sourceId !== 'string' || value.sourceId === tabId.current
        || !('eventId' in value) || typeof value.eventId !== 'string') return
      if (seenAuthEvents.current.has(value.eventId)) return
      seenAuthEvents.current.add(value.eventId)
      if (seenAuthEvents.current.size > 64) {
        const oldest = seenAuthEvents.current.values().next().value
        if (oldest) seenAuthEvents.current.delete(oldest)
      }
      sessionChanged()
    }
    let channel: BroadcastChannel | null = null
    let receiveChannelMessage: ((event: MessageEvent<unknown>) => void) | null = null
    try {
      if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(MUSIC_AUTH_CHANNEL)
    } catch {
      // Use the storage-event fallback when the browser exposes but blocks BroadcastChannel.
    }
    if (channel) {
      receiveChannelMessage = (event) => receiveAuthEvent(event.data)
      channel.addEventListener('message', receiveChannelMessage)
    }
    const receiveStorage = (event: StorageEvent) => {
      if (event.key !== MUSIC_AUTH_STORAGE_KEY || !event.newValue) return
      try {
        receiveAuthEvent(JSON.parse(event.newValue))
      } catch {
        // Ignore malformed or legacy storage values.
      }
    }
    window.addEventListener('storage', receiveStorage)
    return () => {
      if (channel) {
        if (receiveChannelMessage) channel.removeEventListener('message', receiveChannelMessage)
        channel.close()
      }
      window.removeEventListener('storage', receiveStorage)
    }
  }, [reloadHome, resetAccountScopedState])
  useEffect(() => {
    if (pendingVisit) visitDialogRef.current?.focus()
  }, [pendingVisit])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (!composerTaskId) return
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      while (!cancelled && attempts < 36) {
        try {
          const { task } = await api.getComposerTask(composerTaskId)
          if (cancelled) return
          if (task.status === 'succeeded' && validVisual(task.result)) {
            setHome((current) => current.status === 'ready' && current.planet
              ? { ...current, planet: { ...current.planet, visual: task.result! } }
              : current)
            setComposerStatus('ready')
            setComposerTaskId(undefined)
            return
          }
          if (task.status === 'failed') {
            setComposerStatus('failed')
            setComposerTaskId(undefined)
            return
          }
        } catch {
          if (cancelled) return
          setComposerStatus('failed')
          setComposerTaskId(undefined)
          return
        }
        attempts += 1
        await new Promise((resolve) => window.setTimeout(resolve, 1200))
      }
      if (!cancelled) {
        setComposerStatus('delayed')
        setComposerTaskId(undefined)
      }
    }
    void poll()
    return () => { cancelled = true }
  }, [api, composerTaskId])

  const tracks = home.status === 'ready' ? home.tracks : []
  const planet = home.status === 'ready' ? home.planet : null
  const moments = home.status === 'ready' ? home.moments : []
  const visibleTracks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return tracks
    return tracks.filter((track) => [track.title, track.artistName, ...track.genres].join(' ').toLocaleLowerCase().includes(needle))
  }, [query, tracks])
  const planetEditTracks = useMemo(() => {
    const available = new Map(tracks.map((track) => [track.id, track]))
    for (const track of planet?.tracks ?? []) if (!available.has(track.id)) available.set(track.id, track)
    const needle = planetEditQuery.trim().toLocaleLowerCase()
    return [...available.values()].filter((track) => !needle
      || [track.title, track.artistName, ...track.genres].join(' ').toLocaleLowerCase().includes(needle))
  }, [planetEditQuery, planet, tracks])
  const previewSeed = selectedTrackIds.join('-')
  const activeVisual = visualFor(planet)
  const galaxySceneResponse = galaxy.status === 'ready' ? galaxy.response : galaxy.status === 'loading' ? galaxy.previous : undefined
  const galaxySceneSystems = useMemo(
    () => galaxySceneResponse ? buildMusicGalaxySceneSystems(galaxySceneResponse.by, galaxySceneResponse.groups) : [],
    [galaxySceneResponse],
  )
  const selectedGalaxyGroup = galaxy.status === 'ready'
    ? galaxy.response.groups.find((group) => group.key === galaxy.selectedGroupKey)
    : undefined
  const visitedGalaxyGroup = visitedPlanet && galaxySceneResponse
    ? galaxySceneResponse.groups.find((group) => group.planets.some((candidate) => candidate.planetId === visitedPlanet.id))
    : undefined
  const focusedGalaxyKey = visitedGalaxyGroup?.key ?? selectedGalaxyGroup?.key
  const focusedGalaxyId = focusedGalaxyKey && galaxySceneResponse ? `${galaxySceneResponse.by}:${focusedGalaxyKey}` : undefined
  const focusedGalaxySystem = focusedGalaxyId ? galaxySceneSystems.find((system) => system.id === focusedGalaxyId) : undefined

  const openSongPortal = async (track: MusicTrackSummary) => {
    const epoch = accountEpoch.current
    setView('planet')
    setVisitedPlanet(null)
    setVisitError('')
    setSongPortal({ status: 'loading', track })
    try {
      const response = await api.findSongMatches(track.id)
      if (epoch !== accountEpoch.current) return
      setSongPortal({ status: 'ready', track, response })
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setSongPortal({ status: 'error', track, message: portalErrorMessage(error) })
    }
  }

  const requestPublicPlanetVisit = (planetId: string, displayName: string, source: MusicPlanetVisitSource = 'direct', trackId?: string) => {
    if (visitingPlanetId || pendingVisit) return
    setVisitError('')
    setIncognitoVisit(false)
    setPendingVisit({ planetId, displayName, source, ...(trackId ? { trackId } : {}) })
  }

  const visitPublicPlanet = async () => {
    if (!pendingVisit || visitingPlanetId) return
    const epoch = accountEpoch.current
    const { planetId, source, trackId } = pendingVisit
    setVisitingPlanetId(planetId)
    setVisitError('')
    try {
      const result = await api.visitPublicPlanet(planetId, incognitoVisit, source, trackId)
      if (epoch !== accountEpoch.current) return
      setVisitedPlanet(result)
      setPendingVisit(null)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setVisitError(error instanceof MusicApiError && error.status === 404
        ? '这颗星球现在无法公开访问。'
        : portalErrorMessage(error))
    } finally {
      if (epoch === accountEpoch.current) setVisitingPlanetId('')
    }
  }

  const sendFriendRequest = async () => {
    if (!visitedPlanet || socialBusyId) return
    const epoch = accountEpoch.current
    setSocialBusyId(visitedPlanet.id)
    setSocialError('')
    setSocialFeedback('')
    try {
      await api.createFriendRequest(visitedPlanet.id)
      if (epoch !== accountEpoch.current) return
      setSocialFeedback('好友请求已发送；对方接受后，你们会出现在彼此的好友 Orbit 中。')
      const requests = await api.loadFriendRequests()
      if (epoch !== accountEpoch.current) return
      setFriendRequests(requests)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      const code = error instanceof MusicApiError ? error.code : ''
      setSocialError(code === 'REQUEST_ALREADY_PENDING' ? '好友请求已发送，正在等待对方回应。'
        : code === 'ALREADY_FRIENDS' ? '你们已经是好友了。'
          : code === 'FRIEND_REQUESTS_DISABLED' ? '对方暂不接收好友请求。'
            : code === 'REQUEST_REJECTED' ? '对方此前拒绝过此请求，当前不能再次发送。'
              : code === 'USER_BLOCKED' ? '无法向此用户发送好友请求。'
                : '好友请求没有发送成功，请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSocialBusyId('')
    }
  }

  const blockVisitedPlanet = async () => {
    if (!visitedPlanet || blockingPlanetId) return
    if (typeof window !== 'undefined' && !window.confirm(`屏蔽「${visitedPlanet.displayName}」的星主？你们将无法互相发现、访问或私信。`)) return
    const planetId = visitedPlanet.id
    const epoch = accountEpoch.current
    setBlockingPlanetId(planetId)
    setSocialError('')
    try {
      await api.blockPlanet(planetId)
      if (epoch !== accountEpoch.current) return
      setVisitedPlanet(null)
      setSocialFeedback('已屏蔽此星主；双方将不再出现在彼此的发现与 Orbit 中。')
      if (view === 'orbit') void loadOrbit()
    } catch {
      if (epoch !== accountEpoch.current) return
      setSocialError('暂时无法屏蔽此用户，请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setBlockingPlanetId('')
    }
  }

  const loadGalaxy = async (by: GalaxyGroupBy) => {
    const epoch = accountEpoch.current
    const previous = galaxy.status === 'ready' ? galaxy.response : galaxy.status === 'loading' ? galaxy.previous : undefined
    setGalaxy({ status: 'loading', by, ...(previous ? { previous } : {}) })
    try {
      const response = await api.loadGalaxy(by)
      if (epoch !== accountEpoch.current) return
      setGalaxy({ status: 'ready', by, response, selectedGroupKey: null })
      setGalaxyJourney(0)
      setGalaxyRotation(0)
    } catch {
      if (epoch !== accountEpoch.current) return
      if (previous) setGalaxy({ status: 'ready', by: previous.by, response: previous, selectedGroupKey: null })
      else setGalaxy({ status: 'error', by })
    }
  }

  const regroupGalaxy = async (by: GalaxyGroupBy) => {
    if (galaxy.status === 'loading' || galaxy.status === 'ready' && galaxy.by === by) return
    const epoch = accountEpoch.current
    const previous = galaxySceneResponse
    setGalaxyRegrouping(false)
    setGalaxy({ status: 'loading', by, ...(previous ? { previous } : {}) })
    setVisitError('')
    try {
      const response = await api.loadGalaxy(by)
      if (epoch !== accountEpoch.current) return
      setGalaxyRegrouping(true)
      await new Promise((resolve) => window.setTimeout(resolve, 140))
      if (epoch !== accountEpoch.current) return
      setGalaxy({ status: 'ready', by, response, selectedGroupKey: null })
      setGalaxyJourney(0)
      setGalaxyRotation(0)
      await new Promise((resolve) => window.setTimeout(resolve, 220))
    } catch {
      if (epoch !== accountEpoch.current) return
      if (previous) {
        setGalaxy({ status: 'ready', by: previous.by, response: previous, selectedGroupKey: null })
        setVisitError('新的分类暂时无法载入，已保留原来的星系排列。')
      } else setGalaxy({ status: 'error', by })
    } finally {
      if (epoch === accountEpoch.current) setGalaxyRegrouping(false)
    }
  }

  const focusGalaxyGroup = (groupKey: string) => {
    if (galaxy.status !== 'ready') return
    const groupIndex = galaxy.response.groups.findIndex((group) => group.key === groupKey)
    if (groupIndex < 0) return
    setGalaxy({ ...galaxy, selectedGroupKey: groupKey })
    setGalaxyJourney(getTourAnchorProgress(groupIndex, galaxy.response.groups.length) * TOUR_END)
  }

  const focusGalaxyById = (id: string) => {
    const system = galaxySceneSystems.find((item) => item.id === id)
    if (system) focusGalaxyGroup(system.key)
  }

  const loadDiscovery = async () => {
    const epoch = accountEpoch.current
    setDiscovery({ status: 'loading' })
    try {
      const response = await api.loadDiscovery()
      if (epoch !== accountEpoch.current) return
      setDiscovery({ status: 'ready', response })
    } catch {
      if (epoch !== accountEpoch.current) return
      setDiscovery({ status: 'error' })
    }
  }

  const loadOrbit = async () => {
    const epoch = accountEpoch.current
    setOrbit({ status: 'loading' })
    setSocialError('')
    try {
      const [response, requests] = await Promise.all([api.loadOrbit(), api.loadFriendRequests()])
      if (epoch !== accountEpoch.current) return
      setOrbit({ status: 'ready', response })
      setFriendRequests(requests)
    } catch {
      if (epoch !== accountEpoch.current) return
      setOrbit({ status: 'error' })
      setSocialError('暂时无法读取好友请求。')
    }
  }

  const loadSettings = async () => {
    const epoch = accountEpoch.current
    setSettingsStatus('loading')
    setSettingsError('')
    try {
      const settings = await api.loadSocialSettings()
      if (epoch !== accountEpoch.current) return
      setSocialSettings(settings)
      setSettingsStatus('ready')
      void api.loadReportQueue('open', 1).then(() => {
        if (epoch === accountEpoch.current) setModeratorAvailable(true)
      }).catch(() => {
        if (epoch === accountEpoch.current) setModeratorAvailable(false)
      })
    } catch {
      if (epoch !== accountEpoch.current) return
      setSettingsStatus('error')
      setSettingsError('暂时无法读取设置。你可以重试；已有设置不会被覆盖。')
    }
  }

  const reloadFriendSatellites = async () => {
    const epoch = accountEpoch.current
    setFriendSatelliteError('')
    try {
      const { friendSatellites } = await api.loadFriendSatellites()
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready' ? { ...current, friendSatellites } : current)
    } catch {
      if (epoch !== accountEpoch.current) return
      setFriendSatelliteError('好友卫星暂时没有读取成功，请重试。')
    }
  }

  const removeFriendSatellite = async (friend: MusicFriendSatellite) => {
    if (friendSatelliteBusyId) return
    const epoch = accountEpoch.current
    setFriendSatelliteBusyId(friend.id)
    setFriendSatelliteError('')
    setFriendSatelliteFeedback('')
    try {
      await api.deleteFriendSatellite(friend.id)
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready'
        ? { ...current, friendSatellites: current.friendSatellites.filter((item) => item.id !== friend.id) }
        : current)
      setFriendSatelliteFeedback(`已将「${friend.displayName}」移出星球轨道。`)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setFriendSatelliteError(error instanceof MusicApiError && error.status === 404
        ? '这颗好友卫星已经不在轨道上了，请重新读取。'
        : '没有移除成功，请检查连接后重试。')
    } finally {
      if (epoch === accountEpoch.current) setFriendSatelliteBusyId('')
    }
  }

  const loadModerationQueue = async (filter: MusicReportQueueFilter, offset = 0, append = false) => {
    const epoch = accountEpoch.current
    const requestId = ++moderationRequestId.current
    setModerationStatus('loading')
    setModerationError('')
    try {
      const page = await api.loadReportQueue(filter, 50, offset)
      if (epoch !== accountEpoch.current || requestId !== moderationRequestId.current) return
      setModerationFilter(filter)
      setModerationReports((current) => append ? [...current, ...page.reports] : page.reports)
      setModerationHasMore(page.hasMore)
      setModerationStatus('ready')
    } catch (error) {
      if (epoch !== accountEpoch.current || requestId !== moderationRequestId.current) return
      setModerationStatus('error')
      setModerationError('暂时无法读取审核队列。请稍后重试；举报状态没有改变。')
      if (error instanceof MusicApiError && error.status === 404) {
        setModeratorAvailable(false)
        setView('settings')
      }
    }
  }

  const reviewModerationReport = async (reportId: string, status: Exclude<MusicReportStatus, 'open'>) => {
    if (moderationBusyId) return
    const epoch = accountEpoch.current
    setModerationBusyId(reportId)
    setModerationError('')
    try {
      await api.reviewReport(reportId, status)
      if (epoch !== accountEpoch.current) return
      await loadModerationQueue(moderationFilter)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setModerationError(error instanceof MusicApiError && error.status === 409
        ? '这条举报已被其他审核员更新。请刷新队列后再处理。'
        : '状态没有更新成功。请重试；已保存的内容不会被自动删除。')
    } finally {
      if (epoch === accountEpoch.current) setModerationBusyId('')
    }
  }

  const updateSocialPreference = async (key: keyof MusicSocialSettings, value: boolean) => {
    if (settingsSaving) return
    const epoch = accountEpoch.current
    setSettingsSaving(key)
    setSettingsError('')
    try {
      const confirmed = await api.updateSocialSettings(key === 'allowFriendRequests'
        ? { allowFriendRequests: value }
        : { allowDriftBottles: value })
      if (epoch !== accountEpoch.current) return
      setSocialSettings(confirmed)
    } catch {
      if (epoch !== accountEpoch.current) return
      setSettingsError('设置没有保存，仍显示上次确认的状态。请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSettingsSaving('')
    }
  }

  const updatePlanetVisibility = async (visibility: MusicPlanet['visibility']) => {
    if (settingsSaving || !planet) return
    const epoch = accountEpoch.current
    setSettingsSaving('planet-visibility')
    setSettingsError('')
    try {
      const { planet: confirmed } = await api.updateMusicPlanet({ visibility })
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready' ? { ...current, planet: confirmed } : current)
    } catch {
      if (epoch !== accountEpoch.current) return
      setSettingsError('设置没有保存，仍显示上次确认的状态。请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSettingsSaving('')
    }
  }

  const togglePlanetEditTrack = (trackId: string) => {
    const selected = planetEditTrackIds.includes(trackId)
    if (selected) {
      if (planetEditTrackIds.length <= 1) {
        setPlanetEditError('星球至少需要保留一首歌。')
        setPlanetEditFeedback('')
        return
      }
      const next = planetEditTrackIds.filter((id) => id !== trackId)
      setPlanetEditTrackIds(next)
      if (planetEditPrimaryTrackId === trackId) setPlanetEditPrimaryTrackId(next[0] ?? '')
    } else {
      if (planetEditTrackIds.length >= 5) {
        setPlanetEditError('一颗星球最多保留五首歌。')
        setPlanetEditFeedback('')
        return
      }
      setPlanetEditTrackIds([...planetEditTrackIds, trackId])
      if (!planetEditPrimaryTrackId) setPlanetEditPrimaryTrackId(trackId)
    }
    setPlanetEditError('')
    setPlanetEditFeedback('')
  }

  const savePlanetSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planet || settingsSaving) return
    const name = planetEditName.trim()
    const tagline = planetEditTagline.trim()
    if (!name) {
      setPlanetEditError('请为星球填写名称。')
      setPlanetEditFeedback('')
      return
    }
    if (Array.from(name).length > 40 || Array.from(tagline).length > 120) {
      setPlanetEditError('星球名称最多 40 字，简介最多 120 字。')
      setPlanetEditFeedback('')
      return
    }
    if (planetEditTrackIds.length < 1 || planetEditTrackIds.length > 5 || !planetEditTrackIds.includes(planetEditPrimaryTrackId)) {
      setPlanetEditError('请保留 1–5 首歌曲，并从中选择一首主旋律。')
      setPlanetEditFeedback('')
      return
    }

    const currentTrackIds = planet.tracks.map((track) => track.id)
    const currentPrimaryTrackId = planet.tracks.find((track) => track.isPrimary)?.id ?? currentTrackIds[0]
    const patch: {
      displayName: string
      tagline: string
      trackIds?: string[]
      primaryTrackId?: string
    } = { displayName: name, tagline }
    if (planetEditTrackIds.join('\u0000') !== currentTrackIds.join('\u0000')) patch.trackIds = planetEditTrackIds
    if (planetEditPrimaryTrackId !== currentPrimaryTrackId) patch.primaryTrackId = planetEditPrimaryTrackId
    if (name === planet.displayName && tagline === planet.tagline && !patch.trackIds && !patch.primaryTrackId) {
      setPlanetEditError('')
      setPlanetEditFeedback('没有需要保存的更改。')
      return
    }

    const epoch = accountEpoch.current
    setSettingsSaving('planet-profile')
    setPlanetEditError('')
    setPlanetEditFeedback('')
    try {
      const result = await api.updateMusicPlanet(patch)
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready' ? { ...current, planet: result.planet } : current)
      setPlanetEditName(result.planet.displayName)
      setPlanetEditTagline(result.planet.tagline)
      const confirmedTrackIds = result.planet.tracks.map((track) => track.id)
      setPlanetEditTrackIds(confirmedTrackIds)
      setPlanetEditPrimaryTrackId(result.planet.tracks.find((track) => track.isPrimary)?.id ?? confirmedTrackIds[0] ?? '')
      setPlanetEditFeedback(result.compositionTask ? '星球资料已保存，视觉正在重新生成。' : '星球资料已保存。')
      if (result.compositionTask) await beginComposition({ id: result.compositionTask.id })
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setPlanetEditError(errorMessage(error))
      setPlanetEditFeedback('')
    } finally {
      if (epoch === accountEpoch.current) setSettingsSaving('')
    }
  }

  const updateMomentVisibility = async (momentId: string, visibility: MusicMoment['visibility']) => {
    if (settingsSaving) return
    const epoch = accountEpoch.current
    setSettingsSaving(`moment-${momentId}`)
    setSettingsError('')
    try {
      const { moment: confirmed } = await api.updateMoment(momentId, { visibility })
      if (epoch !== accountEpoch.current) return
      if (!confirmed) throw new Error('Moment update was not confirmed')
      setHome((current) => current.status === 'ready'
        ? { ...current, moments: current.moments.map((item) => item.id === momentId ? confirmed : item) }
        : current)
    } catch {
      if (epoch !== accountEpoch.current) return
      setSettingsError('设置没有保存，仍显示上次确认的状态。请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSettingsSaving('')
    }
  }

  const beginMomentEdit = (moment: MusicMoment) => {
    setMomentManagement({
      status: 'editing', momentId: moment.id, contentText: moment.contentText,
      visibility: moment.visibility, busy: false, error: '',
    })
  }

  const saveMomentEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (momentManagement.status !== 'editing' || momentManagement.busy) return
    const currentEdit = momentManagement
    const epoch = accountEpoch.current
    setMomentManagement({ ...currentEdit, busy: true, error: '' })
    try {
      const result = await api.updateMoment(currentEdit.momentId, {
        contentText: currentEdit.contentText.trim(), visibility: currentEdit.visibility,
      })
      if (epoch !== accountEpoch.current) return
      if (!result.moment) throw new Error('Moment update was not confirmed')
      setHome((current) => current.status === 'ready'
        ? { ...current, moments: current.moments.map((moment) => moment.id === currentEdit.momentId ? result.moment! : moment) }
        : current)
      setMomentManagement({ status: 'idle' })
      if (result.compositionTask) await beginComposition({ id: result.compositionTask.id })
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMomentManagement((current) => current.status === 'editing' && current.momentId === currentEdit.momentId
        ? { ...current, busy: false, error: errorMessage(error) }
        : current)
    }
  }

  const deleteMoment = async () => {
    if (momentManagement.status !== 'confirm-delete' || momentManagement.busy) return
    const currentDelete = momentManagement
    const epoch = accountEpoch.current
    setMomentManagement({ ...currentDelete, busy: true, error: '' })
    try {
      const result = await api.deleteMoment(currentDelete.momentId)
      if (epoch !== accountEpoch.current) return
      if (!result.deleted) throw new Error('Moment delete was not confirmed')
      setHome((current) => current.status === 'ready'
        ? { ...current, moments: current.moments.filter((moment) => moment.id !== currentDelete.momentId) }
        : current)
      setMomentManagement({ status: 'idle' })
      if (result.compositionTask) await beginComposition({ id: result.compositionTask.id })
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMomentManagement((current) => current.status === 'confirm-delete' && current.momentId === currentDelete.momentId
        ? { ...current, busy: false, error: errorMessage(error) }
        : current)
    }
  }

  const respondToFriendRequest = async (requestId: string, action: 'accept' | 'reject') => {
    const epoch = accountEpoch.current
    setSocialBusyId(requestId)
    setSocialError('')
    setSocialFeedback('')
    try {
      await api.respondFriendRequest(requestId, action)
      if (epoch !== accountEpoch.current) return
      setSocialFeedback(action === 'accept' ? '已接受好友请求。现在可以在 My Orbit 中私信。' : '已拒绝好友请求。')
      await loadOrbit()
      if (action === 'accept') await reloadFriendSatellites()
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setSocialError(error instanceof MusicApiError && error.code === 'USER_BLOCKED'
        ? '这段关系已被屏蔽，无法建立好友关系。'
        : '好友请求状态已变化，请刷新后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSocialBusyId('')
    }
  }

  const openConversation = async (userId: string, displayName: string) => {
    const epoch = accountEpoch.current
    setConversation({ status: 'loading', userId, displayName })
    setMessageDraft('')
    setMessageError('')
    try {
      const result = await api.loadDirectMessages(userId)
      if (epoch !== accountEpoch.current) return
      setConversation({ status: 'ready', userId, displayName, messages: result.messages })
      if (view === 'orbit') void loadOrbit()
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setConversation({ status: 'error', userId, displayName })
      setMessageError(error instanceof MusicApiError && error.code === 'USER_BLOCKED'
        ? '此好友关系已被屏蔽，私信无法继续。'
        : '无法打开对话；你可能已不再是好友。')
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (conversation.status !== 'ready' || !messageDraft.trim() || sendingMessage) return
    const epoch = accountEpoch.current
    setSendingMessage(true)
    setMessageError('')
    try {
      const result = await api.sendDirectMessage(conversation.userId, messageDraft)
      if (epoch !== accountEpoch.current) return
      setConversation({ ...conversation, messages: [...conversation.messages, result.message] })
      setMessageDraft('')
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMessageError(error instanceof MusicApiError && error.code === 'USER_BLOCKED'
        ? '此好友关系已被屏蔽，无法发送消息。'
        : error instanceof MusicApiError && error.code === 'FRIENDSHIP_REQUIRED'
          ? '好友关系已结束，无法继续私信。'
          : '消息没有发送成功，请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setSendingMessage(false)
    }
  }

  const changeView = (next: ProductView) => {
    setView(next)
    setVisitedPlanet(null)
    setPendingVisit(null)
    setVisitError('')
    if (next === 'galaxy') {
      setSongPortal({ status: 'idle' })
      setGalaxyJourney(0)
      setGalaxyRotation(0)
      void loadGalaxy('genre')
    }
    if (next === 'roam') {
      setSongPortal({ status: 'idle' })
      void loadDiscovery()
    }
    if (next === 'orbit') {
      setSongPortal({ status: 'idle' })
      void loadOrbit()
    }
    if (next === 'bottles') setSongPortal({ status: 'idle' })
    if (next === 'settings') {
      void loadSettings()
      if (view !== 'settings') {
        setPlanetEditName(planet?.displayName ?? '')
        setPlanetEditTagline(planet?.tagline ?? '')
        const trackIds = planet?.tracks.map((track) => track.id) ?? []
        setPlanetEditTrackIds(trackIds)
        setPlanetEditPrimaryTrackId(planet?.tracks.find((track) => track.isPrimary)?.id ?? trackIds[0] ?? '')
        setPlanetEditQuery('')
        setPlanetEditError('')
        setPlanetEditFeedback('')
      }
    }
    if (next === 'moderation') {
      if (!moderatorAvailable) {
        setView('settings')
        return
      }
      setModerationFilter('open')
      void loadModerationQueue('open')
    }
  }
  const changeViewRef = useRef(changeView)
  changeViewRef.current = changeView

  const selectedGroupKeyForWheel = galaxy.status === 'ready' ? galaxy.selectedGroupKey : null
  useEffect(() => {
    if (view !== 'galaxy' || visitedPlanet || galaxy.status !== 'ready') return
    const onWheel = (event: WheelEvent) => {
      const target = event.target
      if (target instanceof Element) {
        const overGalaxyAxis = Boolean(target.closest('.music-galaxy-axis'))
        if (target.closest('.music-panel, .music-topbar, .music-visit-dialog, input, textarea, select')
          || (!overGalaxyAxis && target.closest('button'))) return
      }
      const step = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight)
      if (!step) return
      event.preventDefault()
      if (selectedGroupKeyForWheel) setGalaxyRotation((rotation) => rotation - step * 10)
      else {
        const progress = galaxyJourneyRef.current
        const nextProgress = Math.max(0, Math.min(TOUR_END, progress + step))
        galaxyJourneyRef.current = nextProgress
        setGalaxyJourney(nextProgress)
        if (!reachesTourHomeEndpoint(progress, step)) return
        changeViewRef.current('planet')
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [selectedGroupKeyForWheel, galaxy.status, view, visitedPlanet])

  const canOpenSongPortal = (trackId: string) => Boolean(planet?.tracks.some((track) => track.id === trackId)
    || moments.some((moment) => moment.trackId === trackId && moment.visibility === 'public'))

  const beginComposition = async (existingTask?: { id: string }) => {
    const epoch = accountEpoch.current
    setComposerStatus('pending')
    try {
      const task = existingTask ? { task: { id: existingTask.id } } : await api.composePlanet()
      if (epoch !== accountEpoch.current) return
      setComposerTaskId(task.task.id)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setComposerStatus(error instanceof MusicApiError && error.status === 503 && error.code === 'AI_GATEWAY_NOT_CONFIGURED' ? 'unavailable' : 'failed')
    }
  }

  const createPlanet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validatePlanetDraft(displayName, selectedTrackIds)
    if (!validation.ok) {
      setDraftError(validation.reason === 'name-required' ? '先给星球起个名字。'
        : validation.reason === 'name-too-long' ? '星球名称最多 40 个字符。'
          : '请选择三首不同的歌曲。')
      return
    }
    setDraftError('')
    const epoch = accountEpoch.current
    setCreatingPlanet(true)
    try {
      const result = await api.createPlanet({
        displayName: displayName.trim(),
        tagline: tagline.trim(),
        trackIds: selectedTrackIds,
        visibility: planetPrivate ? 'private' : 'public',
      })
      if (epoch !== accountEpoch.current) return
      setHome((current) => current.status === 'ready'
        ? { ...current, planet: result.planet, moments: [] }
        : current)
      setMomentTrackId(result.planet.tracks.find((track) => track.isPrimary)?.id ?? result.planet.tracks[0]?.id ?? '')
      await beginComposition(result.compositionTask ? { id: result.compositionTask.id } : undefined)
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setDraftError(errorMessage(error))
      if (error instanceof MusicApiError && error.code === 'PLANET_ALREADY_EXISTS') void reloadHome()
    } finally {
      if (epoch === accountEpoch.current) setCreatingPlanet(false)
    }
  }

  const toggleTrack = (trackId: string) => {
    const result = togglePlanetTrack(selectedTrackIds, trackId)
    setSelectedTrackIds(result.trackIds)
    if (result.limitReached) setDraftError('一颗星球先选择三首代表它的歌。')
    else setDraftError('')
  }

  const addMoment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planet || !momentTrackId || savingMoment) return
    const epoch = accountEpoch.current
    setSavingMoment(true)
    setMomentFeedback('')
    try {
      const result = await api.createMoment({
        trackId: momentTrackId,
        contentText: momentText.trim(),
        visibility: momentPrivate ? 'private' : 'public',
      })
      if (epoch !== accountEpoch.current) return
      if (result.moment) setHome((current) => current.status === 'ready'
        ? { ...current, moments: [result.moment!, ...current.moments] }
        : current)
      setMomentText('')
      setMomentFeedback(momentPrivate ? '已保存为仅自己可见。' : 'Moment 已公开，星球开始吸收新的声音。')
      if (result.compositionTask) await beginComposition({ id: result.compositionTask.id })
      else await beginComposition()
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMomentFeedback(errorMessage(error))
    } finally {
      if (epoch === accountEpoch.current) setSavingMoment(false)
    }
  }

  const retryComposition = () => { void beginComposition() }

  if (home.status === 'loading') return <main className="music-app music-loading"><BrandHeader connected={false} /><div className="music-loading-mark" role="status"><span /><p>正在校准你的星际档案…</p></div></main>

  if (home.status === 'error') return <main className="music-app music-gate">
    <BrandHeader connected={false} />
    <section className="music-gate-copy" aria-live="polite">
      <span className="music-kicker">匿名体验 · 自动为本机创建身份</span>
      <h1>暂时连接不上，<br />星际档案仍在原处</h1>
      <p>没有任何资料被覆盖。请检查网络或稍后重新连接。</p>
      <button className="music-primary-button" type="button" onClick={() => { void reloadHome() }}>重新连接 <span aria-hidden="true">↗</span></button>
    </section>
  </main>

  const connected = home.status === 'ready'
  const canCreate = home.status === 'ready' && !planet

  return <main className={`music-app${planet ? ' has-planet' : ' is-onboarding'}`}>
    <Stage
      planet={planet} friendSatellites={home.status === 'ready' ? home.friendSatellites : []} visitedPlanet={visitedPlanet} previewSeed={previewSeed} reducedMotion={reducedMotion}
      productView={view} focusedGalaxy={focusedGalaxyId} galaxySystems={galaxySceneSystems}
      galaxyRotation={galaxyRotation} routeJourney={galaxyJourney} regrouping={galaxyRegrouping}
      onSelectGalaxy={focusGalaxyById}
      onOpenPlanet={(scenePlanet, _galaxyId) => requestPublicPlanetVisit(scenePlanet.id, scenePlanet.alias, 'galaxy')}
      onRotate={(delta) => setGalaxyRotation((rotation) => rotation + delta)}
    />
    <BrandHeader connected={connected} view={view} onChangeView={changeView} />
    {view === 'galaxy' && !visitedPlanet && galaxy.status === 'ready' && !galaxy.selectedGroupKey && <MusicGalaxyAxis
      systems={galaxySceneSystems} journey={galaxyJourney}
      onSelect={(index) => setGalaxyJourney(getTourAnchorProgress(index, galaxySceneSystems.length) * TOUR_END)}
      onHome={() => changeView('planet')}
    />}
    {view === 'galaxy' && !visitedPlanet && focusedGalaxySystem && <MusicGalaxyFooter
      label={focusedGalaxySystem.label} color={focusedGalaxySystem.color}
      onBack={() => { if (galaxy.status === 'ready') setGalaxy({ ...galaxy, selectedGroupKey: null }) }}
    />}

    <div className="music-layout">
      <section className="music-copy">
        <span className="music-kicker">{visitedPlanet ? '公开星球 · 正在访问' : view === 'galaxy' ? 'Galaxy · 动态发现' : view === 'roam' ? '首页 · 随机漫游' : view === 'orbit' ? '相遇与来往 · 私人星图' : view === 'bottles' ? '漂流瓶 · 随机接力' : view === 'moderation' ? '内容安全 · 内部审核' : view === 'settings' ? '个人边界 · 由你决定' : planet ? '你的星球 · 正在播放自己的宇宙' : '从三首歌开始 · 让星球有形状'}</span>
        <h1>{visitedPlanet
          ? <>{visitedPlanet.displayName}<em>{view === 'roam' ? '在漫游中相遇。' : '在 Galaxy 相遇。'}</em></>
          : view === 'galaxy' ? <>沿着歌声，<em>继续漫游。</em></>
          : view === 'roam' ? <>下一站，<em>交给歌声。</em></>
          : view === 'orbit' ? <>每一次相遇，<em>都有迹可循。</em></>
          : view === 'bottles' ? <>让一首歌，<em>漂向下一个人。</em></>
          : view === 'moderation' ? <>让安全，<em>有迹可循。</em></>
          : view === 'settings' ? <>让边界，<em>由你决定。</em></>
          : planet ? <>{planet.displayName}<em>在歌声里生长。</em></> : <>把喜欢的歌<br /><em>安放成一颗星球。</em></>}</h1>
        <p>{visitedPlanet
          ? visitedPlanet.tagline || '沿着歌曲、艺人或曲风，在公开星球之间继续探索。'
          : view === 'galaxy' ? '按歌曲、艺人或曲风浏览可公开访问的星球。同歌标签只代表曲目 ID 一致，不代表真实播放记录。'
          : view === 'roam' ? '沿着相近的曲风与公开 Moment，随机遇见一颗真实的公开星球。这里只是发现，不会把相似说成撞歌。'
          : view === 'orbit' ? '这里收纳撞歌相遇、好友、访问足迹与今日路过的星球。推荐不会自动变成访问记录。'
          : view === 'bottles' ? '每天最多放出一只，收瓶完全随机；读后可以回应，也可以决定是否让它继续漂流。'
          : view === 'moderation' ? '审核队列只展示举报元数据，不读取被举报正文。状态变更会写入审核记录，不会自动删除内容。'
          : view === 'settings' ? '控制你的星球是否可被访问、是否接收好友请求和漂流瓶，也可以逐条调整 Moment 的公开范围。'
          : planet
            ? planet.tagline || '选中的歌曲会成为它的轨道；你留下的 Moment，会让它继续变化。'
          : '挑三首此刻愿意留在身边的歌。星球由歌曲和你公开分享的 Moment 慢慢长出自己的颜色。'}</p>
        {planet && !visitedPlanet && view === 'planet' && <div className="music-world-readout" aria-live="polite">
          <span className={`music-ai-indicator is-${composerStatus}`}><i />{composerStatus === 'pending' ? '本地 AI 正在生成星球' : composerStatus === 'ready' ? '星球视觉已生成' : composerStatus === 'unavailable' ? '本地 AI 通道尚未连接' : composerStatus === 'failed' ? '星球视觉暂时未更新' : composerStatus === 'delayed' ? '生成时间较长，星球已保存' : '星球等待第一次视觉生成'}</span>
          <p>{activeVisual.summary}</p>
          {(composerStatus === 'unavailable' || composerStatus === 'failed' || composerStatus === 'delayed' || composerStatus === 'idle') && <button type="button" className="music-text-button" onClick={retryComposition}>重试星球生成</button>}
        </div>}
      </section>

      {canCreate && view === 'planet' ? <aside className="music-panel music-create-panel" aria-label="创建音乐星球">
        {!tracks.length ? <div className="music-empty-catalog" role="status">
          <span className="music-kicker">曲库 · 暂未开放</span>
          <h2>曲库还没有可选歌曲</h2>
          <p>添加曲目后，你就可以开始创建星球。我们只展示可控曲库中的歌曲，并跳转到官方平台播放。</p>
        </div> : <form onSubmit={createPlanet}>
          <div className="music-panel-head"><div><span className="music-kicker">第一步 · 选择声音</span><h2>为你的星球选三首歌</h2></div><span className="music-count" aria-live="polite">{selectedTrackIds.length}<i>/3</i></span></div>
          <p className="music-panel-note">你的星球默认公开，可随时改为仅自己可见。完整音频不会嵌入 Moodverse。</p>
          {tracks.some(isDemoTrack) && <p className="music-demo-catalog-note" role="note">演示曲库：曲名、艺人与曲风均为虚构示例，不提供播放或官方链接，也不代表已获版权授权。</p>}
          <label className="music-search-label" htmlFor="music-track-search">搜索曲名或艺人</label>
          <input id="music-track-search" className="music-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="曲名、艺人、曲风" />
          <div className="music-track-list" role="group" aria-label="曲库">
            {visibleTracks.map((track) => {
              const selected = selectedTrackIds.includes(track.id)
              const disabled = !selected && selectedTrackIds.length >= 3
              return <button className={`music-track-choice${selected ? ' is-selected' : ''}`} type="button" key={track.id} aria-label={`${track.title} · ${track.artistName}`} aria-pressed={selected} disabled={disabled} onClick={() => toggleTrack(track.id)}>
                {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
                <span className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.versionLabel ? ` · ${track.versionLabel}` : ''}{isDemoTrack(track) ? ' · 演示曲目（不可播放）' : ''}</small></span>
                <span className="music-track-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
              </button>
            })}
            {!visibleTracks.length && <p className="music-no-matches">没有找到匹配曲目。</p>}
          </div>
          <div className="music-fields">
            <label htmlFor="music-planet-name">星球名称</label>
            <input id="music-planet-name" value={displayName} maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="给这颗星球起个名字" required />
            <label htmlFor="music-planet-tagline">一句星球简介（可选）</label>
            <input id="music-planet-tagline" value={tagline} maxLength={120} onChange={(event) => setTagline(event.target.value)} placeholder="例如：慢慢靠岸，也不必急着抵达" />
          </div>
          <label className="music-visibility-toggle"><input type="checkbox" checked={!planetPrivate} onChange={(event) => setPlanetPrivate(!event.target.checked)} /> <span><strong>允许在 Galaxy 中访问</strong><small>默认公开；之后可在设置中关闭。</small></span></label>
          {draftError && <p className="music-form-error" role="alert">{draftError}</p>}
          <button className="music-primary-button music-submit" type="submit" disabled={creatingPlanet || tracks.length < 3 || selectedTrackIds.length !== 3 || !displayName.trim()}>
            {creatingPlanet ? '正在保存星球…' : '生成我的星球'} <span aria-hidden="true">↗</span>
          </button>
          <p className="music-privacy-note">公开给访客的 Moment 单独标记；未公开内容不会参与星球视觉生成。</p>
        </form>}
      </aside> : null}

      {view === 'settings' && !visitedPlanet && <aside className="music-panel music-settings-panel" aria-label="账户与隐私设置">
        <div className="music-panel-head"><div><span className="music-kicker">Moodverse · 账户偏好</span><h2>账户与隐私设置</h2></div></div>
        <p className="music-panel-note">星球访问权限与接收偏好彼此独立。公开星球会出现在 Galaxy；每条 Moment 也可以单独设为仅自己可见。</p>
        {settingsStatus === 'loading' && <p className="music-moments-empty" role="status">正在读取已保存的设置…</p>}
        {settingsError && <p className="music-form-error" role="alert">{settingsError}</p>}
        {settingsStatus === 'error' && <button className="music-text-button" type="button" onClick={() => { void loadSettings() }}>重新读取设置</button>}
        {planet && <form className="music-settings-planet-form" aria-label="编辑星球资料" onSubmit={savePlanetSettings}>
          <section className="music-settings-section" aria-label="星球资料与歌曲">
            <div className="music-section-heading"><h3>星球资料与歌曲</h3><span>可随时调整</span></div>
            <div className="music-fields">
              <label htmlFor="music-settings-planet-name">星球名称</label>
              <input id="music-settings-planet-name" aria-label="星球名称" value={planetEditName} maxLength={40} disabled={Boolean(settingsSaving)} onChange={(event) => { setPlanetEditName(event.target.value); setPlanetEditError(''); setPlanetEditFeedback('') }} />
              <label htmlFor="music-settings-planet-tagline">星球简介</label>
              <input id="music-settings-planet-tagline" aria-label="星球简介" value={planetEditTagline} maxLength={120} disabled={Boolean(settingsSaving)} onChange={(event) => { setPlanetEditTagline(event.target.value); setPlanetEditError(''); setPlanetEditFeedback('') }} />
            </div>
            <div className="music-section-heading music-settings-song-heading"><h3>星球歌曲</h3><span>{planetEditTrackIds.length}<i> / 5 首</i></span></div>
            <p className="music-panel-note">创建时的三首只是起点；现在可以保留 1–5 首。主旋律会作为这颗星球的代表歌曲。</p>
            <label className="music-search-label" htmlFor="music-settings-track-search">搜索曲名或艺人</label>
            <input id="music-settings-track-search" className="music-search" type="search" value={planetEditQuery} disabled={Boolean(settingsSaving)} onChange={(event) => setPlanetEditQuery(event.target.value)} placeholder="曲名、艺人、曲风" />
            <div className="music-settings-tracks" role="group" aria-label="编辑星球歌曲">
              {planetEditTracks.map((track) => {
                const selected = planetEditTrackIds.includes(track.id)
                const canToggle = selected ? planetEditTrackIds.length > 1 : planetEditTrackIds.length < 5
                return <div className="music-settings-track-row" key={track.id}>
                  <label className={`music-track-choice music-settings-track${selected ? ' is-selected' : ''}`}>
                    <input type="checkbox" aria-label={`星球歌曲：${track.title} · ${track.artistName}`} checked={selected} disabled={Boolean(settingsSaving) || !canToggle} onChange={() => togglePlanetEditTrack(track.id)} />
                    {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
                    <span className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.versionLabel ? ` · ${track.versionLabel}` : ''}{isDemoTrack(track) ? ' · 演示曲目（不可播放）' : ''}</small></span>
                  </label>
                  <label className="music-primary-track-choice">
                    <input type="radio" name="music-planet-primary" aria-label={`星球主旋律：${track.title} · ${track.artistName}`} checked={planetEditPrimaryTrackId === track.id} disabled={!selected || Boolean(settingsSaving)} onChange={() => { setPlanetEditPrimaryTrackId(track.id); setPlanetEditFeedback('') }} />
                    <span>主旋律</span>
                  </label>
                </div>
              })}
              {!planetEditTracks.length && <p className="music-no-matches">曲库中没有可管理的歌曲。</p>}
            </div>
            {planetEditError && <p className="music-form-error" role="alert">{planetEditError}</p>}
            {planetEditFeedback && <p className="music-feedback" role="status">{planetEditFeedback}</p>}
            <button className="music-secondary-button" type="submit" disabled={Boolean(settingsSaving)}>{settingsSaving === 'planet-profile' ? '正在保存…' : '保存星球资料'}</button>
          </section>
        </form>}
        {settingsStatus === 'ready' && socialSettings && <div className="music-settings-content">
          <section className="music-settings-section" aria-label="访问与接收偏好">
            <div className="music-section-heading"><h3>访问与接收</h3><span>随时可更改</span></div>
            {planet
              ? <label className="music-visibility-toggle music-settings-toggle">
                  <input aria-label="允许在 Galaxy 中访问" type="checkbox" checked={planet.visibility === 'public'} disabled={Boolean(settingsSaving)} onChange={(event) => { void updatePlanetVisibility(event.target.checked ? 'public' : 'private') }} />
                  <span><strong>允许在 Galaxy 中访问</strong><small>{settingsSaving === 'planet-visibility' ? '正在保存…' : planet.visibility === 'public' ? '公开星球可被浏览和访问。' : '仅自己可见，不会出现在 Galaxy。'}</small></span>
                </label>
              : <p className="music-moments-empty">创建星球后，可以在这里管理它的访问权限。</p>}
            <label className="music-visibility-toggle music-settings-toggle">
              <input aria-label="接收好友请求" type="checkbox" checked={socialSettings.allowFriendRequests} disabled={Boolean(settingsSaving)} onChange={(event) => { void updateSocialPreference('allowFriendRequests', event.target.checked) }} />
              <span><strong>接收好友请求</strong><small>{settingsSaving === 'allowFriendRequests' ? '正在保存…' : socialSettings.allowFriendRequests ? '访客可以向你发送好友请求。' : '暂不接收新的好友请求。'}</small></span>
            </label>
            <label className="music-visibility-toggle music-settings-toggle">
              <input aria-label="接收漂流瓶" type="checkbox" checked={socialSettings.allowDriftBottles} disabled={Boolean(settingsSaving)} onChange={(event) => { void updateSocialPreference('allowDriftBottles', event.target.checked) }} />
              <span><strong>接收漂流瓶</strong><small>{settingsSaving === 'allowDriftBottles' ? '正在保存…' : socialSettings.allowDriftBottles ? '系统可以向你投递新的漂流瓶。' : '暂不接收新的漂流瓶。'}</small></span>
            </label>
          </section>
          <section className="music-settings-section" aria-label="好友卫星管理">
            <div className="music-section-heading"><h3>好友卫星</h3><span>{home.status === 'ready' ? `${home.friendSatellites.length} 颗` : '读取中'}</span></div>
            <p className="music-panel-note">已成为好友的人会围绕你的星球运行；每个新账号另有 3 位虚拟演示好友。虚拟好友不会伪装成真实账号，也不会进入私信或访问记录；移除后不会自动补回。</p>
            {friendSatelliteError && <div className="music-galaxy-empty" role="alert"><p>{friendSatelliteError}</p><button type="button" className="music-text-button" onClick={() => { void reloadFriendSatellites() }}>重新读取</button></div>}
            {friendSatelliteFeedback && <p className="music-feedback" role="status">{friendSatelliteFeedback}</p>}
            {home.status === 'ready' && home.friendSatellites.length > 0
              ? <div className="music-friend-satellites-list">{home.friendSatellites.map((friend) => <article className="music-friend-satellite-row" key={friend.id}>
                  <span className="music-friend-satellite-icon" style={{ '--friend-color': friend.color } as CSSProperties} aria-hidden="true"><i /></span>
                  <span className="music-friend-satellite-copy"><strong>{friend.displayName}</strong><small>{friend.tagline || (friend.isVirtual ? '虚拟演示好友' : '已成为好友')}</small></span>
                  {friend.canRemove && <button className="music-text-button" type="button" aria-label={`移除好友卫星 ${friend.displayName}`} disabled={Boolean(friendSatelliteBusyId)} onClick={() => { void removeFriendSatellite(friend) }}>{friendSatelliteBusyId === friend.id ? '移除中…' : '移除'}</button>}
                </article>)}</div>
              : home.status === 'ready' ? <p className="music-moments-empty">轨道暂时空着。之后可以继续认识新的朋友。</p> : null}
          </section>
          <section className="music-settings-section" aria-label="Moment 公开范围">
            <div className="music-section-heading"><h3>Moment 公开范围</h3><span>{momentsLoadError ? '暂不可用' : `${moments.length} 条`}</span></div>
            {!planet ? <p className="music-moments-empty">创建星球并留下 Moment 后，可以逐条调整公开范围。</p>
              : momentsLoadError ? <div className="music-galaxy-empty" role="alert"><p>暂时无法读取 Moment，当前显示的内容不代表没有记录。</p><button type="button" className="music-text-button" onClick={() => { void reloadMoments() }}>重试读取</button></div>
                : !moments.length ? <p className="music-moments-empty">还没有 Moment。写下之后，你可以在这里决定每条内容是否公开。</p>
                  : <div className="music-settings-moments">{moments.map((moment) => <label className="music-visibility-toggle music-settings-toggle music-settings-moment" key={moment.id}>
                    <input aria-label={`公开 Moment：${moment.track.title}`} type="checkbox" checked={moment.visibility === 'public'} disabled={Boolean(settingsSaving)} onChange={(event) => { void updateMomentVisibility(moment.id, event.target.checked ? 'public' : 'private') }} />
                    <span><strong>{moment.track.title} · {moment.track.artistName}</strong><small>{settingsSaving === `moment-${moment.id}` ? '正在保存…' : moment.visibility === 'public' ? '公开给访客' : '仅自己可见'}{moment.contentText ? ` · ${moment.contentText}` : ''}</small></span>
                  </label>)}</div>}
          </section>
        </div>}
        {moderatorAvailable && settingsStatus === 'ready' && <section className="music-settings-section" aria-label="内部内容审核">
          <div className="music-section-heading"><h3>内部内容审核</h3><span>仅授权账号</span></div>
          <p className="music-panel-note">处理举报并记录状态。审核列表不展示被举报内容。</p>
          <button className="music-secondary-button" type="button" onClick={() => changeView('moderation')}>打开审核队列</button>
        </section>}
        <section className="music-settings-section" aria-label="匿名体验身份">
          <div className="music-section-heading"><h3>匿名体验身份</h3><span>自动创建</span></div>
          <p className="music-panel-note">账号已保存在这个浏览器中。换浏览器或清除本站点数据后，会生成新的随机账号；当前演示阶段暂不支持跨设备找回。</p>
        </section>
      </aside>}

      {view === 'moderation' && !visitedPlanet && moderatorAvailable && <aside className="music-panel music-moderation-panel" aria-label="举报审核">
        <div className="music-panel-head">
          <div><span className="music-kicker">Moodverse · 内部工具</span><h2>举报审核</h2></div>
          <button className="music-text-button" type="button" onClick={() => changeView('settings')}>返回设置</button>
        </div>
        <p className="music-panel-note">仅查看举报人提交的原因和补充说明，以及目标类型、编号等必要元数据。这里不会展示被举报的正文，也不会直接删除内容。</p>
        <div className="music-moderation-toolbar">
          <div><label className="music-moderation-filter-label" htmlFor="music-moderation-filter">筛选审核状态</label>
            <select id="music-moderation-filter" className="music-moderation-filter" value={moderationFilter} disabled={moderationStatus === 'loading'} onChange={(event) => {
              const nextFilter = event.target.value as MusicReportQueueFilter
              setModerationFilter(nextFilter)
              void loadModerationQueue(nextFilter)
            }}>
              {(['open', 'reviewing', 'actioned', 'dismissed', 'all'] as const).map((status) => <option key={status} value={status}>{reportStatusLabels[status]}</option>)}
            </select>
          </div>
          <button className="music-secondary-button" type="button" disabled={moderationStatus === 'loading'} onClick={() => { void loadModerationQueue(moderationFilter) }}>刷新队列</button>
        </div>
        {moderationError && <p className="music-form-error" role="alert">{moderationError}</p>}
        {moderationStatus === 'loading' && <p className="music-moments-empty" role="status">正在读取审核队列…</p>}
        {moderationStatus === 'error' && <button className="music-text-button" type="button" onClick={() => { void loadModerationQueue(moderationFilter) }}>重试读取</button>}
        {moderationStatus === 'ready' && !moderationReports.length && <p className="music-moments-empty">当前筛选下没有待审核记录。</p>}
        {moderationStatus === 'ready' && moderationReports.length > 0 && <div className="music-moderation-list" aria-label="举报记录">
          {moderationReports.map((report) => <article className="music-moderation-report" key={report.id}>
            <div className="music-moderation-report-head">
              <strong>{reportReasonLabels[report.reason]}</strong>
              <span className={`music-moderation-status is-${report.status}`}>{reportStatusLabels[report.status]}</span>
            </div>
            <p className="music-moderation-detail">{report.detail || '举报人没有补充说明。'}</p>
            <dl className="music-moderation-meta">
              <div><dt>举报编号</dt><dd>{report.id}</dd></div>
              <div><dt>目标</dt><dd>{report.target.type} · {report.target.id}</dd></div>
              <div><dt>提交时间</dt><dd>{new Date(report.createdAt).toLocaleString()}</dd></div>
              {report.lastReview && <div><dt>最近审核</dt><dd>{reportStatusLabels[report.lastReview.toStatus as MusicReportStatus] ?? report.lastReview.toStatus ?? '状态已更新'} · {new Date(report.lastReview.createdAt).toLocaleString()}</dd></div>}
            </dl>
            {(report.status === 'open' || report.status === 'reviewing') && <div className="music-moderation-actions">
              {report.status === 'open' && <button className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`开始处理 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'reviewing') }}>开始处理</button>}
              <button className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`标记已处置 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'actioned') }}>标记已处置</button>
              <button className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`驳回 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'dismissed') }}>驳回</button>
              {moderationBusyId === report.id && <span role="status">正在保存…</span>}
            </div>}
          </article>)}
          {moderationHasMore && <button className="music-secondary-button music-moderation-more" type="button" disabled={Boolean(moderationBusyId)} onClick={() => { void loadModerationQueue(moderationFilter, moderationReports.length, true) }}>加载更多举报</button>}
        </div>}
      </aside>}

      {visitedPlanet && <aside className="music-panel music-public-planet-panel" aria-label={`公开星球 ${visitedPlanet.displayName}`}>
        <div className="music-panel-head"><div><span className="music-kicker">公开星球 · 公开内容</span><h2>{visitedPlanet.displayName}</h2></div></div>
        {visitedPlanet.tagline && <p className="music-public-tagline">{visitedPlanet.tagline}</p>}
        <ReportControl api={api} target={{ type: 'planet', id: visitedPlanet.id }} ariaLabel="举报这颗星球" />
        <div className="music-social-actions" aria-label="星主关系">
          <button className="music-secondary-button" type="button" disabled={Boolean(socialBusyId) || Boolean(friendRequests?.outgoing.some((request) => request.planetId === visitedPlanet.id && request.status === 'pending'))} onClick={() => { void sendFriendRequest() }}>
            {socialBusyId === visitedPlanet.id ? '正在发送…' : friendRequests?.outgoing.some((request) => request.planetId === visitedPlanet.id && request.status === 'pending') ? '好友请求已发送' : '发送好友请求'}
          </button>
          <button className="music-text-button music-block-button" type="button" disabled={Boolean(blockingPlanetId)} onClick={() => { void blockVisitedPlanet() }}>
            {blockingPlanetId === visitedPlanet.id ? '正在屏蔽…' : '屏蔽此人'}
          </button>
        </div>
        {socialFeedback && <p className="music-social-feedback" role="status">{socialFeedback}</p>}
        {socialError && <p className="music-form-error" role="alert">{socialError}</p>}
        <button className="music-text-button music-back-link" type="button" onClick={() => setVisitedPlanet(null)}>{view === 'galaxy' ? '← 返回 Galaxy' : view === 'roam' ? '← 返回随机漫游' : view === 'bottles' ? '← 返回漂流瓶' : '← 返回我的星球'}</button>

        <section className="music-public-section" aria-label="对方公开选择的歌曲">
          <div className="music-section-heading"><h3>星球上的歌</h3><span>{visitedPlanet.tracks.length} 首</span></div>
          <div className="music-owned-track-list">
            {visitedPlanet.tracks.map((track) => <article className="music-owned-track" key={track.id}>
              {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
              <div className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.isPrimary ? ' · 星球主旋律' : ''}{isDemoTrack(track) ? ' · 演示曲目（不可播放）' : ''}</small></div>
              {track.officialUrl
                ? <a href={track.officialUrl} target="_blank" rel="noreferrer" aria-label={`${track.title} · ${track.artistName} · 在官方平台打开`}>↗</a>
                : <span className="music-link-unavailable" title="暂无官方播放链接">—</span>}
              {canOpenSongPortal(track.id) && <button className="music-track-portal-button" type="button" onClick={() => { void openSongPortal(track) }}>继续寻找</button>}
            </article>)}
          </div>
        </section>

        <section className="music-public-section music-moments" aria-label="对方公开的 Moments">
          <div className="music-section-heading"><h3>公开 Moment</h3><span>{visitedPlanet.moments.length}</span></div>
          {!visitedPlanet.moments.length
            ? <p className="music-moments-empty">这颗星球还没有公开 Moment。</p>
            : visitedPlanet.moments.map((moment) => <article className="music-moment-item" key={moment.id}>
                <div><strong>{moment.track.title}</strong><span>{new Date(moment.publishedAt ?? moment.createdAt).toLocaleDateString('zh-CN')}</span></div>
                {moment.contentText && <p>{moment.contentText}</p>}
                {moment.photoUrl && <img className="music-public-moment-photo" src={moment.photoUrl} alt="Moment 配图" loading="lazy" />}
                <ReportControl api={api} target={{ type: 'moment', id: moment.id }} ariaLabel="举报这条 Moment" />
              </article>)}
        </section>
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
        {songPortal.status === 'ready' && <button className="music-secondary-button" type="button" onClick={() => setVisitedPlanet(null)}>返回同歌结果</button>}
      </aside>}

      {planet && !visitedPlanet && view === 'planet' && <aside className="music-panel music-planet-panel" aria-label="我的音乐星球">
        <div className="music-panel-head"><div><span className="music-kicker">星球轨道 · {planet.visibility === 'public' ? '公开访问' : '仅自己'}</span><h2>留在这里的歌</h2></div><span className="music-count">{planet.tracks.length}<i>首</i></span></div>
        <div className="music-owned-track-list">
          {planet.tracks.map((track) => <article className="music-owned-track" key={track.id}>
            {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
            <div className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.isPrimary ? ' · 星球主旋律' : ''}{isDemoTrack(track) ? ' · 演示曲目（不可播放）' : ''}</small></div>
            {track.officialUrl
              ? <a href={track.officialUrl} target="_blank" rel="noreferrer" aria-label={`${track.title} · ${track.artistName} · 在官方平台打开`}>↗</a>
              : <span className="music-link-unavailable" title="暂无官方播放链接">—</span>}
            <button className="music-track-portal-button" type="button" onClick={() => { void openSongPortal(track) }}>寻找与《{track.title}》同歌的星球</button>
          </article>)}
        </div>

        {songPortal.status !== 'idle' && <section className="music-song-portal" aria-label="同歌星球">
          <div className="music-section-heading">
            <h3>与《{songPortal.track.title}》同歌</h3>
            <button type="button" className="music-close-inline" aria-label="关闭同歌结果" onClick={() => setSongPortal({ status: 'idle' })}>×</button>
          </div>
          {songPortal.status === 'loading' && <div className="music-discovery-loading" role="status" aria-label="正在寻找同歌星球"><span /><span /><span /></div>}
          {songPortal.status === 'error' && <p className="music-form-error" role="alert">{songPortal.message}</p>}
          {songPortal.status === 'ready' && <>
            <p className={`music-discovery-status${songPortal.response.ranking.mode === 'model' ? ' is-model' : ''}`} aria-live="polite">
              {songPortal.response.ranking.mode === 'model'
                ? 'AI 已在精确同歌候选中排序'
                : songPortal.response.ranking.status === 'no_candidates'
                  ? '没有发现可访问的同歌星球。'
                  : 'AI 排序暂不可用，以下按最近公开活动稳定排序。'}
            </p>
            {!songPortal.response.matches.length
              ? <p className="music-moments-empty">还没有找到可访问的同歌星球。可以从自己的其他歌曲继续探索。</p>
              : <div className="music-discovery-list">
                  {songPortal.response.matches.map((match) => <article className="music-discovery-match" key={match.planetId}>
                    <div className="music-discovery-match-copy"><strong>{match.displayName}</strong>{match.tagline && <p>{match.tagline}</p>}<small>{matchDescription(match)}</small></div>
                    <button className="music-secondary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(match.planetId, match.displayName, 'song_portal', songPortal.track.id)}>
                      {visitingPlanetId === match.planetId ? '正在接近…' : `访问星球 ${match.displayName}`}
                    </button>
                  </article>)}
                </div>}
            {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
          </>}
        </section>}

        <form className="music-moment-form" onSubmit={addMoment}>
          <div className="music-section-heading"><h3>留下一个 Moment</h3><span>最多 500 字</span></div>
          <label htmlFor="music-moment-track">这段 Moment 属于哪首歌</label>
          <select id="music-moment-track" value={momentTrackId} onChange={(event) => setMomentTrackId(event.target.value)}>
            {planet.tracks.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.artistName}</option>)}
          </select>
          <textarea value={momentText} onChange={(event) => setMomentText(event.target.value)} maxLength={500} placeholder="这首歌让你想起了什么？" aria-label="Moment 内容" />
          <div className="music-moment-actions"><label className="music-moment-privacy"><input type="checkbox" checked={momentPrivate} onChange={(event) => setMomentPrivate(event.target.checked)} /><span>{momentPrivate ? '仅自己可见' : '公开给访客'}</span></label><span>{momentText.length}/500</span></div>
          {momentFeedback && <p className="music-feedback" aria-live="polite">{momentFeedback}</p>}
          <button className="music-secondary-button" type="submit" disabled={savingMoment || !momentTrackId}>{savingMoment ? '正在保存…' : '保存 Moment'} <span aria-hidden="true">↗</span></button>
        </form>

        <section className="music-moments" aria-label="我的 Moments">
          <div className="music-section-heading"><h3>沿途留下的 Moment</h3><span>{moments.length}</span></div>
          {!moments.length ? <p className="music-moments-empty">还没有 Moment。写下一段真实的片刻，星球就会继续变化。</p> : moments.map((moment) => <article className="music-moment-item" key={moment.id}>
            <div><strong>{moment.track.title}</strong><span>{moment.visibility === 'public' ? '公开' : '仅自己'} · {new Date(moment.createdAt).toLocaleDateString('zh-CN')}</span></div>
            {moment.contentText && <p>{moment.contentText}</p>}
            {momentManagement.status === 'editing' && momentManagement.momentId === moment.id
              ? <form className="music-moment-editor" onSubmit={(event) => { void saveMomentEdit(event) }}>
                  <label htmlFor={`music-moment-edit-${moment.id}`}>修改 Moment 内容</label>
                  <textarea
                    id={`music-moment-edit-${moment.id}`}
                    aria-label="编辑 Moment 文本"
                    value={momentManagement.contentText}
                    maxLength={500}
                    onChange={(event) => setMomentManagement((current) => current.status === 'editing'
                      ? { ...current, contentText: event.target.value, error: '' }
                      : current)}
                  />
                  <label className="music-moment-privacy">
                    <input
                      type="checkbox"
                      aria-label="编辑 Moment：公开给访客"
                      checked={momentManagement.visibility === 'public'}
                      onChange={(event) => setMomentManagement((current) => current.status === 'editing'
                        ? { ...current, visibility: event.target.checked ? 'public' : 'private', error: '' }
                        : current)}
                    />
                    <span>{momentManagement.visibility === 'public' ? '公开给访客' : '仅自己可见'}</span>
                  </label>
                  <div className="music-moment-owner-actions">
                    <button className="music-secondary-button" type="submit" disabled={momentManagement.busy}>
                      {momentManagement.busy ? '正在保存…' : '保存 Moment 修改'}
                    </button>
                    <button className="music-text-button" type="button" disabled={momentManagement.busy} onClick={() => setMomentManagement({ status: 'idle' })}>取消编辑</button>
                  </div>
                  {momentManagement.error && <p className="music-form-error" role="alert">{momentManagement.error}</p>}
                </form>
              : momentManagement.status === 'confirm-delete' && momentManagement.momentId === moment.id
                ? <div className="music-moment-delete-confirm" role="group" aria-label="确认删除 Moment">
                    <p>删除后，这条 Moment 会从访客页面和发现入口移除。</p>
                    {momentManagement.error && <p className="music-form-error" role="alert">{momentManagement.error}</p>}
                    <div className="music-moment-owner-actions">
                      <button className="music-text-button is-danger" type="button" disabled={momentManagement.busy} onClick={() => { void deleteMoment() }}>
                        {momentManagement.busy ? '正在删除…' : `确认删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`}
                      </button>
                      <button className="music-text-button" type="button" disabled={momentManagement.busy} onClick={() => setMomentManagement({ status: 'idle' })}>
                        {`取消删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`}
                      </button>
                    </div>
                  </div>
                : <div className="music-moment-owner-actions">
                    <button className="music-text-button" type="button" disabled={momentManagement.status !== 'idle'} aria-label={`编辑 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`} onClick={() => beginMomentEdit(moment)}>编辑</button>
                    <button className="music-text-button is-danger" type="button" disabled={momentManagement.status !== 'idle'} aria-label={`删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`} onClick={() => setMomentManagement({ status: 'confirm-delete', momentId: moment.id, busy: false, error: '' })}>删除</button>
                  </div>}
          </article>)}
        </section>
      </aside>}

      {view === 'galaxy' && !visitedPlanet && <aside className="music-panel music-galaxy-panel" aria-label="Galaxy 公开星球发现">
        <div className="music-panel-head"><div><span className="music-kicker">公开星球 · 可直接访问</span><h2>Galaxy</h2></div></div>
        <p className="music-panel-note">按曲目、艺人或曲风浏览。艺人／曲风相近不代表听过同一首歌。</p>
        <div className="music-galaxy-dimensions" role="group" aria-label="Galaxy 分组方式">
          {([{ id: 'song', label: '歌曲' }, { id: 'artist', label: '艺人' }, { id: 'genre', label: '曲风' }] as const).map((option) => <button
            type="button"
            key={option.id}
            aria-pressed={galaxy.status !== 'idle' && galaxy.by === option.id}
            disabled={galaxy.status === 'loading'}
            onClick={() => { void regroupGalaxy(option.id) }}
          >{option.label}</button>)}
        </div>
        {galaxy.status === 'loading' && <p className="music-moments-empty" role="status">正在整理公开星球…</p>}
        {galaxy.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>Galaxy 暂时没有响应。</p><button type="button" className="music-text-button" onClick={() => { void loadGalaxy(galaxy.by) }}>重试</button></div>}
        {galaxy.status === 'ready' && <>
          {!galaxy.response.groups.length
            ? <p className="music-moments-empty">现在还没有可展示的公开星球。</p>
            : <div className="music-galaxy-groups" role="group" aria-label="发现分组">
                {galaxy.response.groups.map((group) => <button
                  type="button"
                  className={`music-galaxy-group${galaxy.selectedGroupKey === group.key ? ' is-selected' : ''}`}
                  key={group.key}
                  aria-pressed={galaxy.selectedGroupKey === group.key}
                  onClick={() => focusGalaxyGroup(group.key)}
                >{group.label} <span>· {group.planetCount}</span></button>)}
              </div>}
          {galaxy.response.groups.find((group) => group.key === galaxy.selectedGroupKey) && (() => {
            const group = galaxy.response.groups.find((item) => item.key === galaxy.selectedGroupKey)!
            return <section className="music-public-section" aria-label="分组中的公开星球">
              <div className="music-section-heading"><h3>{group.label}</h3><span>{group.planetCount} 颗</span></div>
              <div className="music-discovery-list">
                {group.planets.map((candidate) => <article className="music-discovery-match" key={candidate.planetId}>
                  <div className="music-discovery-match-copy"><strong>{candidate.displayName}</strong>{candidate.tagline && <p>{candidate.tagline}</p>}<small>{galaxyReason(candidate.reasonCode)}</small></div>
                  <button className="music-secondary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(candidate.planetId, candidate.displayName, 'galaxy')}>
                    {visitingPlanetId === candidate.planetId ? '正在接近…' : `访问星球 ${candidate.displayName}`}
                  </button>
                </article>)}
              </div>
            </section>
          })()}
        </>}
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
      </aside>}

      {view === 'roam' && !visitedPlanet && <aside className="music-panel music-discovery-panel" aria-label="随机漫游">
        <div className="music-panel-head"><div><span className="music-kicker">相关性与随机性 · 今日航线</span><h2>随机漫游</h2></div></div>
        <p className="music-panel-note">只从真实、公开可访问的星球中探索。打开卡片才会访问；推荐本身不会留下足迹。</p>
        {discovery.status === 'loading' && <p className="music-moments-empty" role="status">正在寻找下一站…</p>}
        {discovery.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>暂时无法整理漫游路线。</p><button type="button" className="music-text-button" onClick={() => { void loadDiscovery() }}>重试</button></div>}
        {discovery.status === 'ready' && <>
          <p className={`music-discovery-status${discovery.response.ranking.mode === 'model' ? ' is-model' : ''}`} aria-live="polite">
            {discovery.response.ranking.mode === 'model'
              ? `本地语义模型 · ${discovery.response.ranking.model?.name ?? 'Embedding'} 已参与排序`
              : discovery.response.ranking.status === 'no_candidates'
                ? '暂时没有其他可访问的公开星球。'
              : discovery.response.ranking.status === 'no_query_signals'
                  ? '还没有可用于个性化的选歌，先为你随机开放探索。'
                  : discovery.response.ranking.status === 'input_changed'
                    ? '公开内容刚刚发生变化，已按当前可见内容重新整理路线。'
                  : 'AI 通道暂不可用，已按曲风、情绪与公开 Moment 规则降级。'}
          </p>
          {!discovery.response.recommendations.length
            ? <p className="music-moments-empty">没有可推荐的星球。这里不会用虚构内容填空。</p>
            : <div className="music-discovery-list">
                {discovery.response.recommendations.map((candidate) => <article className="music-discovery-match" key={candidate.planetId}>
                  <div className="music-discovery-match-copy"><strong>{candidate.displayName}</strong>{candidate.tagline && <p>{candidate.tagline}</p>}<small>{discoveryReason(candidate.reasonCode)}</small></div>
                  <button className="music-secondary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(candidate.planetId, candidate.displayName, 'random_roam')}>
                    {visitingPlanetId === candidate.planetId ? '正在接近…' : `访问星球 ${candidate.displayName}`}
                  </button>
                </article>)}
              </div>}
          <button className="music-text-button music-reroll-button" type="button" onClick={() => { void loadDiscovery() }}>再漫游一次 ↗</button>
        </>}
      </aside>}

      {view === 'bottles' && !visitedPlanet && <DriftBottlePanel
        api={api}
        tracks={tracks}
        moments={moments}
        onVisitPlanet={(planetId, name) => requestPublicPlanetVisit(planetId, name, 'direct')}
      />}

      {view === 'orbit' && !visitedPlanet && <aside className="music-panel music-orbit-panel" aria-label="My Orbit">
        <div className="music-panel-head"><div><span className="music-kicker">你的私人星图 · 仅自己可见</span><h2>My Orbit</h2></div></div>
        <p className="music-panel-note">足迹会随星球当前的公开状态变化；隐身访问只留在你的历史里。</p>
        {orbit.status === 'loading' && <p className="music-moments-empty" role="status">正在整理你的星图…</p>}
        {orbit.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>暂时无法读取 My Orbit。</p><button type="button" className="music-text-button" onClick={() => { void loadOrbit() }}>重试</button></div>}
        {socialFeedback && view === 'orbit' && <p className="music-social-feedback" role="status">{socialFeedback}</p>}
        {socialError && view === 'orbit' && <p className="music-form-error" role="alert">{socialError}</p>}
        {friendRequests && view === 'orbit' && <section className="music-orbit-group music-friend-requests" aria-label="好友请求">
          <div className="music-section-heading"><h3>好友请求</h3><span>{friendRequests.incoming.length} 待处理</span></div>
          <h4>收到的好友请求</h4>
          {!friendRequests.incoming.length ? <p className="music-moments-empty">还没有新的请求。</p> : friendRequests.incoming.map((request) => <article className="music-orbit-entry" key={request.id}>
            <div><strong>{request.displayName}</strong>{request.tagline && <p>{request.tagline}</p>}</div>
            <div className="music-request-actions">
              <button type="button" className="music-secondary-button" disabled={socialBusyId === request.id} onClick={() => { void respondToFriendRequest(request.id, 'accept') }}>接受 {request.displayName}</button>
              <button type="button" className="music-text-button" disabled={socialBusyId === request.id} onClick={() => { void respondToFriendRequest(request.id, 'reject') }}>拒绝</button>
            </div>
          </article>)}
          <h4>已发送</h4>
          {!friendRequests.outgoing.length ? <p className="music-moments-empty">你发送的好友请求会显示在这里。</p> : friendRequests.outgoing.map((request) => <article className="music-orbit-entry" key={request.id}>
            <div><strong>{request.displayName}</strong>{request.tagline && <p>{request.tagline}</p>}</div>
            <small>{request.status === 'rejected' ? '对方暂未接受' : '等待对方回应'}</small>
          </article>)}
        </section>}
        {conversation.status !== 'closed' && <section className="music-orbit-group music-conversation" aria-label={`与${conversation.displayName}的私信`}>
          <div className="music-section-heading"><div><h3>与 {conversation.displayName} 私信</h3><small>仅好友可见</small></div><button className="music-text-button" type="button" onClick={() => { setConversation({ status: 'closed' }); setMessageError('') }}>返回好友列表</button></div>
          {conversation.status === 'loading' && <p className="music-moments-empty" role="status">正在打开对话…</p>}
          {conversation.status === 'error' && <p className="music-moments-empty">对话不可用，请确认好友关系仍然有效。</p>}
          {conversation.status === 'ready' && <>
            <div className="music-message-list" role="log" aria-label="私信记录">
              {!conversation.messages.length ? <p className="music-moments-empty">还没有消息，可以从一句简单的问候开始。</p> : conversation.messages.map((message) => <article className={`music-message${message.isOwn ? ' is-own' : ''}`} key={message.id}>
                <p>{message.contentText}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN')}</time>
                {!message.isOwn && <ReportControl api={api} target={{ type: 'direct_message', id: message.id }} ariaLabel="举报这条私信" />}
              </article>)}
            </div>
            <form className="music-message-form" onSubmit={(event) => { void sendMessage(event) }}>
              <label htmlFor="music-direct-message">发送私信</label>
              <textarea id="music-direct-message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={2000} placeholder="写一条文字消息…" />
              {messageError && <p className="music-form-error" role="alert">{messageError}</p>}
              <button className="music-primary-button" type="submit" disabled={sendingMessage || !messageDraft.trim()}>{sendingMessage ? '发送中…' : '发送'}</button>
            </form>
          </>}
        </section>}
        {orbit.status === 'ready' && <div className="music-orbit-groups">
          <section className="music-orbit-group" aria-label="撞歌遇见">
            <div className="music-section-heading"><h3>撞歌遇见</h3><span>{orbit.response.groups.songEncounters.length}</span></div>
            {!orbit.response.groups.songEncounters.length ? <p className="music-moments-empty">还没有通过同歌通道访问过星球。</p> : orbit.response.groups.songEncounters.map((entry) => <article className="music-orbit-entry" key={entry.planetId}>
              <div><strong>{entry.displayName}</strong>{entry.tagline && <p>{entry.tagline}</p>}</div>
              <button type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'orbit')}>访问星球</button>
            </article>)}
          </section>
          <section className="music-orbit-group" aria-label="好友">
            <div className="music-section-heading"><h3>好友</h3><span>{orbit.response.groups.friends.length}</span></div>
            {!orbit.response.groups.friends.length ? <p className="music-moments-empty">成为好友后，会长期留在这里。</p> : orbit.response.groups.friends.map((entry) => <article className="music-orbit-entry" key={entry.userId}>
              <div><strong>{entry.displayName}</strong>{entry.unreadCount > 0 && <small className="music-unread-count">未读 {entry.unreadCount} 条</small>}{entry.tagline && <p>{entry.tagline}</p>}{!entry.canVisit && <small>星球当前不可公开访问</small>}</div>
              <div className="music-friend-actions">
                <button type="button" className="music-secondary-button" aria-label={`私信 ${entry.displayName}${entry.unreadCount > 0 ? `，未读 ${entry.unreadCount} 条` : ''}`} onClick={() => { void openConversation(entry.userId, entry.displayName) }}>私信{entry.unreadCount > 0 ? ` · ${entry.unreadCount}` : ''}</button>
                {entry.canVisit && entry.planetId && <button type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId!, entry.displayName, 'orbit')}>访问星球</button>}
              </div>
            </article>)}
          </section>
          <section className="music-orbit-group" aria-label="我访问过">
            <div className="music-section-heading"><h3>我访问过</h3><span>{orbit.response.groups.visitedByMe.length}</span></div>
            {!orbit.response.groups.visitedByMe.length ? <p className="music-moments-empty">你访问过的公开星球会出现在这里。</p> : orbit.response.groups.visitedByMe.map((entry) => <article className="music-orbit-entry" key={entry.planetId}>
              <div><strong>{entry.displayName}</strong>{entry.tagline && <p>{entry.tagline}</p>}{entry.isIncognito && <small>隐身访问 · 仅你可见</small>}</div>
              <button type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'orbit')}>再次访问</button>
            </article>)}
          </section>
          <section className="music-orbit-group" aria-label="访问过我">
            <div className="music-section-heading"><h3>访问过我</h3><span>{orbit.response.groups.visitorsToMe.length}</span></div>
            {!orbit.response.groups.visitorsToMe.length ? <p className="music-moments-empty">非隐身访客的公开星球会显示在这里。</p> : orbit.response.groups.visitorsToMe.map((entry) => <article className="music-orbit-entry" key={`${entry.userId}-${entry.planetId}`}>
              <div><strong>{entry.displayName}</strong>{entry.tagline && <p>{entry.tagline}</p>}</div>
              <button type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'orbit')}>回访星球</button>
            </article>)}
          </section>
          <section className="music-orbit-group" aria-label="路过的星球">
            <div className="music-section-heading"><h3>路过的星球</h3><span>{orbit.response.groups.dailyRoam.length} · {orbit.response.date}</span></div>
            {!orbit.response.groups.dailyRoam.length ? <p className="music-moments-empty">今天没有可推荐的公开星球。</p> : orbit.response.groups.dailyRoam.map((entry) => <article className="music-orbit-entry" key={entry.planetId}>
              <div><strong>{entry.displayName}</strong>{entry.tagline && <p>{entry.tagline}</p>}<small>{discoveryReason(entry.reasonCode)}</small></div>
              <button type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'daily_roam')}>访问星球 {entry.displayName}</button>
            </article>)}
          </section>
        </div>}
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
      </aside>}
    </div>

    {pendingVisit && <div className="music-visit-backdrop">
      <section
        ref={visitDialogRef}
        className="music-visit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-visit-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !visitingPlanetId) {
            setPendingVisit(null)
            setVisitError('')
          }
        }}
      >
        <span className="music-kicker">公开星球 · 访问前确认</span>
        <h2 id="music-visit-title">要访问「{pendingVisit.displayName}」吗？</h2>
        <p>默认会在对方的 Orbit 留下最近访问足迹。你也可以选择隐身；隐身足迹只保留在自己的访问历史中。</p>
        <label className="music-visit-incognito"><input type="checkbox" checked={incognitoVisit} onChange={(event) => setIncognitoVisit(event.target.checked)} /><span><strong>隐身访问</strong><small>对方不会在“访问过我”中看到你</small></span></label>
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
        <div className="music-visit-actions">
          <button className="music-secondary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => { setPendingVisit(null); setVisitError('') }}>暂不访问</button>
          <button className="music-primary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => { void visitPublicPlanet() }}>{visitingPlanetId ? '正在接近…' : '继续访问'} <span aria-hidden="true">↗</span></button>
        </div>
      </section>
    </div>}
  </main>
}

export default MusicApp
