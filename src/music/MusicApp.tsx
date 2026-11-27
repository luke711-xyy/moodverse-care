import { Paginated } from './Pagination'
import { DriftBottlePanel } from './DriftBottlePanel'
import { OrbitGrid } from './OrbitGrid'
import { Communicator } from './Communicator'
import { GalaxyAxisNode } from './GalaxyAxisNode'
import { GalaxySelectionSettings } from './GalaxySelectionSettings'
import { FriendManagement, type FriendChange } from './FriendManagement'
import type { GalaxyPreferencesPatch, GalaxySelectionKind, GalaxySelectionOption } from './galaxy-preferences'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { GalaxyGroupBy, MusicAdminReport, MusicApi, MusicDiscoveryResponse, MusicFriendSatellite, MusicGalaxyResponse, MusicMoment, MusicOrbitResponse, MusicPlanet, MusicPlanetDraft, MusicPlanetVisitSource, MusicReportQueueFilter, MusicReportReason, MusicReportStatus, MusicReportTarget, MusicSocialSettings, PublicMusicPlanet, SongPortalMatch, SongPortalResponse } from '../music-api'
import { createMusicApi, MusicApiError } from '../music-api'
import { togglePlanetTrack, validatePlanetDraft } from '../music-app-domain'
import type { MusicTrackSummary } from '../music-domain'
import { buildMusicGalaxySceneSystems } from './galaxy-scene'
import { advanceGalaxyWheel, galaxyTourPosition } from './galaxy-navigation'
import { useGalaxyJourney } from './useGalaxyJourney'
import { getTourAnchorProgress, normalizeWheelDelta, reachesTourHomeEndpoint, TOUR_END } from '../universe'
import { Stage } from './dither/Stage'
import { AppearanceEditor } from './dither/AppearanceEditor'
import { SongWall } from './dither/SongWall'
import { DitherButton, DitherTitle, DitherLoadingRing, DitherTrackMark } from './dither/components'
import { resolveDitherSpec, type DitherPlanetSpec, type DitherOverrides } from './dither/appearance'
import { CockpitShell } from './cockpit/CockpitShell'
import { GalaxyTelemetry, PersonalTelemetry, SignalMap } from './cockpit/MonitorReadouts'
import { cockpitReducer, initialCockpitState, type CockpitPage } from './cockpit/state'
import { getFlightSpeed, useCockpitFlight } from './cockpit/flight'
import { logicalSize } from './viewport'
import { COSMOS_BEAT, DEFAULT_TRACK_ID } from './default-track'
import { useMusicPlayer } from './useMusicPlayer'
import { canPreloadMusic } from './audio-preload'
import { useSocialSync } from './useSocialSync'
import { useDailyRollover } from './useDailyRollover'
import { scheduleMusicPrefetch } from './prefetch'
import { createGalaxyPreloader, preloadGalaxyGenres } from './galaxy-preload'
import type { MusicPlayerControls } from './useMusicPlayer'
import { MomentContent, MomentPhotoPicker } from './MomentPhoto'
import { AudiusCdPicker } from './AudiusCdPicker'
import { CdPicker } from './CdPicker'
import { GalaxyWindow } from './GalaxyWindow'
import { PlanetCard } from './PlanetCard'
import { AUDIUS_GENRES, DEFAULT_GALAXY_GENRES } from './genres'
import { momentPhotoError } from './moment-photo'
import { CopilotPanel, type CopilotIntercomHandle, type CopilotPhase } from './copilot/CopilotPanel'
import { PairedDevices } from './copilot/PairedDevices'
import { CopilotProjection } from './cockpit/CopilotProjection'
import { FirstRun } from './onboarding/FirstRun'
import './music-app.css'
import './dither/product.css'
import './cockpit/product.css'
import './viewport.css'

type HomeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tracks: MusicTrackSummary[]; planet: MusicPlanet | null; moments: MusicMoment[]; friendSatellites: MusicFriendSatellite[] }

type SongPortalState =
  | { status: 'idle' }
  | { status: 'loading'; track: MusicTrackSummary; sourcePlanetId?: string }
  | { status: 'ready'; track: MusicTrackSummary; sourcePlanetId?: string; response: SongPortalResponse }
  | { status: 'error'; track: MusicTrackSummary; sourcePlanetId?: string; message: string }

type ProductView = CockpitPage

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

type MomentManagementState =
  | { status: 'idle' }
  | { status: 'editing'; momentId: string; contentText: string; visibility: MusicMoment['visibility']; busy: boolean; error: string }
  | { status: 'confirm-delete'; momentId: string; busy: boolean; error: string }

const MUSIC_AUTH_CHANNEL = 'moodverse-music-auth'
const MUSIC_AUTH_STORAGE_KEY = 'moodverse-music-auth-change'

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
    {!open && !feedback && <DitherButton className="music-text-button music-report-trigger" type="button" aria-label={ariaLabel} onClick={() => { setOpen(true); setError('') }}>举报</DitherButton>}
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
        <DitherButton className="music-text-button" type="button" disabled={busy} onClick={() => setOpen(false)}>取消</DitherButton>
        <DitherButton className="music-secondary-button" type="submit" disabled={busy}>{busy ? '正在提交…' : '提交举报'}</DitherButton>
      </div>
    </form>}
    {feedback && <p className="music-report-feedback" role="status">{feedback}</p>}
  </div>
}

function MusicGalaxyAxis({ systems, journey, homeApproach, onSelect, onHome, reducedMotion }: {
  systems: ReturnType<typeof buildMusicGalaxySceneSystems>
  journey: number
  homeApproach: number
  onSelect: (index: number) => void
  onHome: () => void
  reducedMotion: boolean
}) {
  const progress = systems.length ? Math.max(0, Math.min(1, journey / TOUR_END)) : 0
  const { currentIndex, axisProgress } = galaxyTourPosition(progress, systems.length, homeApproach)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = scroll.current?.querySelector<HTMLElement>('[aria-current="step"]')
    const el = scroll.current
    if (!el || !node) return
    // Scroll this strip only, never scroll the entire cockpit with scrollIntoView.
    const center = node.offsetLeft + node.offsetWidth / 2
    if (center < el.scrollLeft + 20 || center > el.scrollLeft + el.clientWidth - 20)
      el.scrollLeft = Math.max(0, center - el.clientWidth / 2)
  }, [currentIndex])
  if (!systems.length) return null
  const current = systems[currentIndex]
  return <div className="music-galaxy-axis" style={{ '--axis-color': current.color } as CSSProperties}>
    <div ref={scroll} className="music-galaxy-axis-scroll" role="group" aria-label="Galaxy 星系导航">
      <div className="music-galaxy-axis-track" style={{ '--axis-track-width': `${Math.max(100, (systems.length + 1) * 36)}px`, '--axis-node-count': systems.length + 1 } as CSSProperties}>
        <i style={{ transform: `scaleX(${axisProgress})` }} />
        {systems.map((system, index) => <DitherButton
          type="button" key={system.id} title={`星系 · ${system.label}`}
          aria-label={`前往星系 ${system.label}`} aria-current={index === currentIndex ? 'step' : undefined}
          className={index === currentIndex ? 'is-current' : index < currentIndex ? 'is-passed' : ''}
          style={{ '--node-color': system.color } as CSSProperties}
          onClick={() => onSelect(index)}
        ><GalaxyAxisNode reducedMotion={reducedMotion} /></DitherButton>)}
        <DitherButton type="button" className="music-galaxy-axis-home" aria-label="穿过星云回到我的星球" title="我的星球" onClick={onHome}><GalaxyAxisNode home reducedMotion={reducedMotion} /></DitherButton>
      </div>
    </div>
  </div>
}

function errorMessage(error: unknown) {
  if (!(error instanceof MusicApiError)) return '暂时无法连接星际档案库。请稍后再试。'
  if (error.code === 'PLANET_ALREADY_EXISTS') return '你的星球已经创建好了。正在重新读取它。'
  if (error.code === 'UNKNOWN_OR_INACTIVE_TRACK') return '有歌曲已从曲库下架，请重新选择仍可用的曲目。'
  if (['PHOTO_TOO_LARGE','TOO_MANY_PHOTOS','UNSUPPORTED_PHOTO_TYPE','INVALID_PHOTO','PHOTO_STORAGE_UNAVAILABLE'].includes(error.code)) return momentPhotoError(error.code)
  if (error.status === 401) return '本机匿名身份暂不可用，请刷新页面后重试。'
  if (error.code === 'APPEARANCE_CONFLICT') return '星球资料已在别处更新，请重新打开资料页后再保存。当前填写内容已保留。'
  if (error.code === 'INVALID_PRIMARY_TRACK') return '请从当前星球歌曲中选择一首主旋律后重试。'
  return '服务器未能完成保存，已保留当前填写内容。请稍后重试。'
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


function MusicApp({ apiOverride, firstRunStorageKey = 'mosic-first-run-v1', replayFirstRunOnEntry = false }: { apiOverride?: MusicApi; firstRunStorageKey?: string; replayFirstRunOnEntry?: boolean } = {}) {
  const [api] = useState(() => apiOverride ?? createMusicApi())
  const [firstRunOpen, setFirstRunOpen] = useState(() => {
    if (replayFirstRunOnEntry) return true
    // The legacy '1' marker only meant opened, not completed or explicitly skipped.
    try { return localStorage.getItem(firstRunStorageKey) !== 'completed' } catch { return true }
  })
  const firstRunCreateLock = useRef(false)
  const cockpitRoot = useRef<HTMLDivElement>(null)
  const firstRunWasOpen = useRef(firstRunOpen)
  const [galaxyPreloader] = useState(() => createGalaxyPreloader(api))
  useEffect(() => { preloadGalaxyGenres() }, [])
  const [home, setHome] = useState<HomeState>({ status: 'loading' })
  useEffect(() => {
    if (firstRunOpen) { firstRunWasOpen.current = true; return }
    if (firstRunWasOpen.current && home.status === 'ready') {
      firstRunWasOpen.current = false
      cockpitRoot.current?.querySelector<HTMLElement>('.cockpit-terminal:not([hidden]) button, .cockpit-wing button')?.focus({ preventScroll: true })
    }
  }, [firstRunOpen, home.status])
  const savedPrimaryTrack = home.status === 'ready'
    ? home.planet?.tracks.find(track => track.isPrimary && track.audioUrl) ?? home.planet?.tracks.find(track => track.audioUrl) ?? null
    : null
  const [query, setQuery] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [tagline, setTagline] = useState('')
  const [planetPrivate, setPlanetPrivate] = useState(false)
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([])
  const [draftError, setDraftError] = useState('')
  const [creatingPlanet, setCreatingPlanet] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [appearancePreview, setAppearancePreview] = useState<DitherPlanetSpec | null>(null)
  const [appearanceBusy, setAppearanceBusy] = useState(false)
  const [appearanceError, setAppearanceError] = useState('')
  const [focusedTrackId, setFocusedTrackId] = useState<string>()
  const [momentTrackId, setMomentTrackId] = useState('')
  const [momentText, setMomentText] = useState('')
  const [momentPhoto, setMomentPhoto] = useState<File | null>(null)
  const [momentPhotoFeedback, setMomentPhotoFeedback] = useState('')
  const [momentPrivate, setMomentPrivate] = useState(false)
  const [savingMoment, setSavingMoment] = useState(false)
  const [momentFeedback, setMomentFeedback] = useState('')
  const [momentManagement, setMomentManagement] = useState<MomentManagementState>({ status: 'idle' })
  const momentComposer = useRef<HTMLFormElement>(null)
  const [momentComposeRequested, setMomentComposeRequested] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [songPortal, setSongPortal] = useState<SongPortalState>({ status: 'idle' })
  const songPortalResults = useRef<HTMLElement>(null)
  const [cockpit, dispatchCockpit] = useReducer(cockpitReducer, initialCockpitState)
  const view = cockpit.console.page
  const setView = useCallback((page: ProductView) => dispatchCockpit({ type: 'open', page }), [])
  useEffect(() => {
    if (view !== 'collision' || songPortal.status === 'idle') return
    const results = songPortalResults.current
    const content = results?.closest<HTMLElement>('.cockpit-terminal-content')
    if (!results || !content) return
    // Logical offsets also work in the rotated mobile viewport; scroll only the terminal.
    content.scrollTo?.({ top: Math.max(0, results.offsetTop - 16), behavior: reducedMotion ? 'instant' : 'smooth' })
  }, [view, songPortal, reducedMotion])
  useEffect(() => {
    if (view !== 'moment' || !momentComposeRequested) return
    momentComposer.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    momentComposer.current?.querySelector('textarea')?.focus({ preventScroll: true })
    setMomentComposeRequested(false)
  }, [view, momentComposeRequested])
  const [crtEnabled, setCrtEnabled] = useState(() => { try { return localStorage.getItem('moodverse-crt') !== 'off' } catch { return true } })
  const projectionOpen = view === 'copilot' && cockpit.console.focus === 'overview' && cockpit.travel.status === 'idle'
  const [copilotPhase, setCopilotPhase] = useState<CopilotPhase>('idle')
  const copilotIntercom = useRef<CopilotIntercomHandle>(null)
  const [copilotPlanets, setCopilotPlanets] = useState<{ planetId: string; displayName: string }[]>([])
  const [initiative, setInitiative] = useState<'quiet' | 'balanced' | 'chatty'>('quiet')
  const [copilotNotice, setCopilotNotice] = useState<{ text: string; page: 'bottles' | 'copilot' } | null>(null)
  const noticeCount = useRef(0)
  const announce = useCallback((text: string, page: 'bottles' | 'copilot' = 'copilot') => {
    if (document.hidden || initiative === 'quiet' || noticeCount.current >= (initiative === 'chatty' ? 4 : 2)) return
    noticeCount.current++
    setCopilotNotice({ text, page })
  }, [initiative])
  const [bottleDraft, setBottleDraft] = useState<{ text: string; trackId?: string } | null>(null)
  const [bottlesMounted, setBottlesMounted] = useState(false)
  const profileInitialized = useRef(false)
  const [blockConfirm, setBlockConfirm] = useState(false)
  const [galaxy, setGalaxy] = useState<GalaxyState>({ status: 'idle' })
  const [galaxyWindowOpen, setGalaxyWindowOpen] = useState(false)
  useEffect(() => {
    if (galaxy.status !== 'ready' || cockpit.exterior !== 'galaxy' || cockpit.console.focus !== 'overview') setGalaxyWindowOpen(false)
  }, [galaxy.status, cockpit.exterior, cockpit.console.focus])
  const { journey: galaxyJourney, journeyRef: galaxyJourneyRef, setJourney: setGalaxyJourney, animateTo: animateGalaxyJourney } = useGalaxyJourney(
    reducedMotion, !projectionOpen && cockpit.exterior === 'galaxy' && cockpit.console.focus === 'overview' && cockpit.travel.status === 'idle' && galaxy.status === 'ready',
  )
  const [galaxyRotation, setGalaxyRotation] = useState(0)
  const [galaxyRegrouping, setGalaxyRegrouping] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: 'idle' })
  const [orbit, setOrbit] = useState<OrbitState>({ status: 'idle' })
  const [socialSettings, setSocialSettings] = useState<MusicSocialSettings | null>(null)
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaving, setSettingsSaving] = useState('')
  const [galaxyGenres, setGalaxyGenres] = useState<string[]>(DEFAULT_GALAXY_GENRES)
  const [genreDraft, setGenreDraft] = useState<string[]>(DEFAULT_GALAXY_GENRES)
  const [galaxyArtists, setGalaxyArtists] = useState<GalaxySelectionOption[]>([])
  const [galaxySongs, setGalaxySongs] = useState<GalaxySelectionOption[]>([])
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
  const [friendSatelliteBusyId, setFriendSatelliteBusyId] = useState('')
  const [friendSatelliteError, setFriendSatelliteError] = useState('')
  const [friendSatelliteFeedback, setFriendSatelliteFeedback] = useState('')
  const [socialError, setSocialError] = useState('')
  const [socialFeedback, setSocialFeedback] = useState('')
  const [socialBusyId, setSocialBusyId] = useState('')
  const [conversation, setConversation] = useState<{ userId: string; displayName: string } | null>(null)
  const [momentsLoadError, setMomentsLoadError] = useState(false)
  const [momentsLoading, setMomentsLoading] = useState(false)
  const [blockingPlanetId, setBlockingPlanetId] = useState('')
  const [visitedPlanet, setVisitedPlanet] = useState<PublicMusicPlanet | null>(null)
  const [preflightMusic, setPreflightMusic] = useState<{ planetId: string; track: MusicTrackSummary | null } | null>(null)
  const [pendingVisit, setPendingVisit] = useState<{ planetId: string; displayName: string; source: MusicPlanetVisitSource; trackId?: string; sourcePlanetId?: string } | null>(null)
  const [incognitoVisit, setIncognitoVisit] = useState(false)
  const [visitingPlanetId, setVisitingPlanetId] = useState('')
  const [visitError, setVisitError] = useState('')
  const accountEpoch = useRef(0)
  const bottleAccountEpoch = accountEpoch.current
  const social = useSocialSync(api, home.status === 'ready', accountEpoch.current)
  const friendRequests = social.snapshot
  const orbitFriends = social.snapshot?.friends.map(friend => ({ ...friend, visual: friend.visual ?? (orbit.status === 'ready'
    ? orbit.response.groups.friends.find(entry => entry.userId === friend.userId && entry.planetId === friend.planetId)?.visual : undefined) }))
    ?? (orbit.status === 'ready' ? orbit.response.groups.friends : [])
  const visibleSocialFeedback = socialFeedback.startsWith('好友请求已发送') && friendRequests
    && !friendRequests.outgoing.some(request => request.status === 'pending') ? '' : socialFeedback
  const visitedFriend = social.snapshot?.friends.find(friend => friend.planetId === visitedPlanet?.id)
  const visitedIncoming = friendRequests?.incoming.find(request => request.planetId === visitedPlanet?.id)
  const visitedOutgoing = friendRequests?.outgoing.find(request => request.planetId === visitedPlanet?.id)
  const satelliteRefreshId = useRef(0)
  const visitLock = useRef(false)
  const visitRequestId = useRef(0)
  const returnVisitors = useRef<Array<PublicMusicPlanet | null>>([])
  const flightController = useCockpitFlight(reducedMotion, trip => {
    if (trip.to === 'visitor') setVisitedPlanet(trip.targetVisitor)
    else setVisitedPlanet(null)
    if (trip.returning) {
      returnVisitors.current.pop()
      announce('已归航。要再听一首刚才那颗星球的歌吗？')
    }
    else if (trip.to === 'visitor') returnVisitors.current.push(trip.sourceVisitor)
    setPendingVisit(null)
    dispatchCockpit({ type: 'arrive', token: trip.token })
  })
  const approachingPlanet = flightController.flight?.targetVisitor
  const musicPlayer = useMusicPlayer({
    backgroundTrack: savedPrimaryTrack, ready: home.status === 'ready',
    playlist: home.status === 'ready' ? home.planet?.tracks ?? [] : [],
    visit: cockpit.exterior === 'visitor' && visitedPlanet ? { planetId: visitedPlanet.id, tracks: visitedPlanet.tracks } : null,
    preloadTrack: approachingPlanet
      ? approachingPlanet.tracks.find(track => track.isPrimary && track.audioUrl) ?? null
      : preflightMusic?.planetId === pendingVisit?.planetId ? preflightMusic?.track ?? null : null,
  })
  const lastTrackEnding = useRef(0)
  useEffect(() => {
    const ended = musicPlayer.completedTrack
    if (!ended || ended.at === lastTrackEnding.current) return
    lastTrackEnding.current = ended.at
    if (cockpit.console.focus === 'overview') announce(`《${ended.title}》播完了。再找一首？`)
  }, [musicPlayer.completedTrack, cockpit.console.focus, announce])
  const priorEchoes = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    if (initiative === 'quiet' || home.status !== 'ready' || cockpit.console.focus !== 'overview') return
    let active = true
    const checkEchoes = async () => {
      if (document.hidden) return
      try {
        const { sent } = await api.loadDriftBottles()
        if (!active) return
        const previous = priorEchoes.current
        priorEchoes.current = new Map(sent.map(row => [row.id, row.commentCount ?? 0]))
        if (previous && sent.some(row => (row.commentCount ?? 0) > (previous.get(row.id) ?? 0))) announce('你寄出的漂流瓶收到新回声了。', 'bottles')
      } catch { /* Mail remains available from the exploration terminal. */ }
    }
    void checkEchoes()
    document.addEventListener('visibilitychange', checkEchoes)
    return () => { active = false; document.removeEventListener('visibilitychange', checkEchoes) }
  }, [api, home.status, cockpit.console.focus, initiative, announce])
  useEffect(() => {
    if (!pendingVisit || home.status !== 'ready') { setPreflightMusic(null); return }
    if (cockpit.travel.status !== 'idle' || !canPreloadMusic()) return
    const controller = new AbortController(), epoch = accountEpoch.current
    // This GET is read-only: no visit trace and no incognito decision is made.
    // The confirmed POST result remains authoritative for the destination.
    void api.loadPublicPlanet(pendingVisit.planetId, controller.signal).then(planet => {
      if (!controller.signal.aborted && epoch === accountEpoch.current) {
        setPreflightMusic({ planetId: planet.id, track: planet.tracks.find(track => track.isPrimary && track.audioUrl) ?? null })
      }
    }).catch(() => { /* Preload failure must never block the actual visit. */ })
    return () => controller.abort()
  }, [api, pendingVisit?.planetId, home.status, cockpit.travel.status])
  const goHomeRef = useRef(() => {})
  const moderationRequestId = useRef(0)
  const songRequestId = useRef(0)
  const galaxyRequestId = useRef(0)
  const discoveryRequestId = useRef(0)
  const orbitRequestId = useRef(0)
  const tabId = useRef(`${Date.now()}-${Math.random()}`)
  const seenAuthEvents = useRef(new Set<string>())

  const invalidateSocialDiscovery = useCallback(() => {
    galaxyPreloader.clear()
    songRequestId.current++; galaxyRequestId.current++; discoveryRequestId.current++; orbitRequestId.current++
    setSongPortal({ status: 'idle' }); setGalaxy({ status: 'idle' })
    setDiscovery({ status: 'idle' }); setOrbit({ status: 'idle' })
    setGalaxyWindowOpen(false)
    setGalaxyRegrouping(false)
  }, [])

  const resetAccountScopedState = useCallback(() => {
    api.invalidateHome?.()
    setFirstRunOpen(false)
    firstRunCreateLock.current = false
    galaxyPreloader.clear()
    accountEpoch.current += 1
    flightController.cancel()
    returnVisitors.current = []
    visitLock.current = false
    visitRequestId.current += 1
    setHome({ status: 'loading' })
    dispatchCockpit({ type: 'reset' })
    profileInitialized.current = false
    setBottlesMounted(false)
    setCopilotPhase('idle')
    setCopilotPlanets([])
    setInitiative('quiet')
    setCopilotNotice(null)
    setBottleDraft(null)
    noticeCount.current = 0
    priorEchoes.current = null
    setQuery('')
    setDisplayName('')
    setTagline('')
    setPlanetPrivate(false)
    setSelectedTrackIds([])
    setDraftError('')
    setCreatingPlanet(false)
    setAppearanceOpen(false)
    setAppearancePreview(null)
    setAppearanceError('')
    setAppearanceBusy(false)
    setMomentTrackId('')
    setMomentText('')
    setMomentPhoto(null)
    setMomentPhotoFeedback('')
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
    setGalaxyGenres(DEFAULT_GALAXY_GENRES); setGenreDraft(DEFAULT_GALAXY_GENRES)
    setGalaxyArtists([]); setGalaxySongs([])
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
    setFriendSatelliteBusyId('')
    setFriendSatelliteError('')
    setFriendSatelliteFeedback('')
    setSocialError('')
    setSocialFeedback('')
    setSocialBusyId('')
    setConversation(null)
    setMomentsLoadError(false)
    setMomentsLoading(false)
    setBlockingPlanetId('')
    setVisitedPlanet(null)
    setPendingVisit(null)
    setIncognitoVisit(false)
    setVisitingPlanetId('')
    setVisitError('')
  }, [api])

  const homeRequestId = useRef(0)
  const reloadHome = useCallback(async () => {
    const epoch = accountEpoch.current
    const requestId = ++homeRequestId.current
    setHome({ status: 'loading' })
    try {
      const { tracks, planet, friendSatellites } = await api.loadHome()
      if (epoch !== accountEpoch.current || requestId !== homeRequestId.current) return
      setMomentsLoadError(false)
      setMomentsLoading(Boolean(planet))
      setHome({ status: 'ready', tracks, planet, moments: [], friendSatellites })
      if (!planet && tracks.some(track => track.id === DEFAULT_TRACK_ID))
        setSelectedTrackIds(current => current.length ? current : [DEFAULT_TRACK_ID])
      if (planet) {
        setMomentTrackId(planet.tracks.find((track) => track.isPrimary)?.id ?? planet.tracks[0]?.id ?? '')
        // The world and navigation do not depend on the personal journal.
        try {
          const moments = await api.loadMoments()
          if (epoch !== accountEpoch.current || requestId !== homeRequestId.current) return
          setHome(current => current.status === 'ready' && current.planet?.id === planet.id
            ? { ...current, moments: [...current.moments, ...moments.filter(moment => !current.moments.some(saved => saved.id === moment.id))] } : current)
        } catch {
          if (epoch === accountEpoch.current && requestId === homeRequestId.current) setMomentsLoadError(true)
        } finally {
          if (epoch === accountEpoch.current && requestId === homeRequestId.current) setMomentsLoading(false)
        }
      }
    } catch (error) {
      if (epoch !== accountEpoch.current || requestId !== homeRequestId.current) return
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
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])

  const tracks = home.status === 'ready' ? home.tracks : []
  const draftTrackIds = useRef<string[]>([])
  draftTrackIds.current = [...selectedTrackIds, ...planetEditTrackIds]
  const mergeCatalogTracks = useCallback((incoming: MusicTrackSummary[]) => {
    setHome(current => {
      if (current.status !== 'ready') return current
      const map = new Map(current.tracks.map(t => [t.id, t]))
      incoming.forEach(t => map.set(t.id, t))
      // Keep selected/referenced tracks even after many provider searches.
      const keep = new Set([...draftTrackIds.current, ...(current.planet?.tracks.map(t => t.id) ?? []), ...current.moments.map(m => m.trackId), ...incoming.map(t => t.id)])
      const all = [...map.values()]
      return { ...current, tracks: all.filter((t, i) => keep.has(t.id) || i >= all.length - 300) }
    })
  }, [])
  const planet = home.status === 'ready' ? home.planet : null
  const moments = home.status === 'ready' ? home.moments : []
  const planetEditTracks = useMemo(() => {
    const available = new Map(tracks.map((track) => [track.id, track]))
    for (const track of planet?.tracks ?? []) if (!available.has(track.id)) available.set(track.id, track)
    return [...available.values()]
  }, [planet, tracks])
  const previewSeed = selectedTrackIds.join('-')
  const activeVisual = useMemo(() => planet ? resolveDitherSpec(planet.id, planet.tracks, planet.visual) : null, [planet])
  const galaxySceneResponse = galaxy.status === 'ready' ? galaxy.response : galaxy.status === 'loading' ? galaxy.previous : undefined
  const galaxySceneSystems = useMemo(
    () => galaxySceneResponse ? buildMusicGalaxySceneSystems(galaxySceneResponse.by, galaxySceneResponse.groups) : [],
    [galaxySceneResponse],
  )
  const selectedGalaxyGroup = galaxy.status === 'ready'
    ? galaxy.response.groups.find((group) => group.key === galaxy.selectedGroupKey)
    : undefined
  const hudTour = galaxyTourPosition(galaxyJourney / TOUR_END, galaxySceneSystems.length)
  const hudSystemIndex = hudTour.currentIndex
  const hudSystem = galaxySceneSystems[hudSystemIndex]
  const hudGroup = galaxySceneResponse?.groups.find(group => group.key === hudSystem?.key)
  const hudSector = hudSystem && hudGroup ? { id: hudSystem.id, label: hudSystem.label, index: hudSystemIndex, visiblePlanets: hudSystem.planets.length, totalPlanets: hudGroup.planetCount } : null

  const openSongPortal = async (track: MusicTrackSummary, sourcePlanetId?: string) => {
    const epoch = accountEpoch.current
    const requestId = ++songRequestId.current
    setView('collision')
    setVisitError('')
    setSongPortal({ status: 'loading', track, sourcePlanetId })
    try {
      const response = await api.findSongMatches(track.id, sourcePlanetId)
      if (epoch !== accountEpoch.current || requestId !== songRequestId.current) return
      setSongPortal({ status: 'ready', track, sourcePlanetId, response })
    } catch (error) {
      if (epoch !== accountEpoch.current || requestId !== songRequestId.current) return
      setSongPortal({ status: 'error', track, sourcePlanetId, message: portalErrorMessage(error) })
    }
  }

  const requestPublicPlanetVisit = (planetId: string, displayName: string, source: MusicPlanetVisitSource = 'direct', trackId?: string, sourcePlanetId?: string) => {
    if (visitLock.current || cockpit.travel.status !== 'idle') return
    setVisitError('')
    setIncognitoVisit(false)
    setPendingVisit({ planetId, displayName, source, ...(trackId ? { trackId } : {}), ...(sourcePlanetId ? { sourcePlanetId } : {}) })
    setView('preflight')
  }

  useEffect(() => {
    if (home.status !== 'ready' || firstRunOpen) return
    const url = new URL(window.location.href)
    const id = url.searchParams.get('visitPlanet')
    const panel = url.searchParams.get('panel')
    if (id && /^[a-zA-Z0-9:_-]{1,128}$/.test(id)) {
      requestPublicPlanetVisit(id, (url.searchParams.get('planetName') || '公开星球').slice(0, 80))
      url.searchParams.delete('visitPlanet')
      url.searchParams.delete('planetName')
    } else if (panel === 'copilot' || panel === 'devices') {
      changeView(panel === 'devices' ? 'settings' : 'copilot')
      url.searchParams.delete('panel')
    } else return
    window.history.replaceState(window.history.state, '', url)
  }, [home.status, firstRunOpen])

  const visitPublicPlanet = async () => {
    if (!pendingVisit || visitLock.current) return
    const token = flightController.start({ from: cockpit.exterior, to: 'visitor', ready: false, sourceVisitor: visitedPlanet, targetVisitor: null, returning: false })
    if (token === null) return
    visitLock.current = true
    const requestId = ++visitRequestId.current
    dispatchCockpit({ type: 'depart', token, target: 'visitor', originConsole: cockpit.history.at(-1) })
    const epoch = accountEpoch.current
    const { planetId, source, trackId, sourcePlanetId } = pendingVisit
    setVisitingPlanetId(planetId)
    setVisitError('')
    try {
      const result = await api.visitPublicPlanet(planetId, incognitoVisit, source, trackId, sourcePlanetId)
      if (epoch !== accountEpoch.current || !flightController.isCurrent(token)) return
      flightController.ready(token, result)
      dispatchCockpit({ type: 'ready', token })
    } catch (error) {
      if (epoch !== accountEpoch.current || !flightController.isCurrent(token)) return
      flightController.cancel(); dispatchCockpit({ type: 'cancel', token }); setView('preflight')
      setVisitError(error instanceof MusicApiError && error.status === 404
        ? '这颗星球现在无法公开访问。'
        : portalErrorMessage(error))
    } finally {
      if (epoch === accountEpoch.current && requestId === visitRequestId.current) { setVisitingPlanetId(''); visitLock.current = false }
    }
  }

  const sendFriendRequest = async () => {
    if (!visitedPlanet || socialBusyId) return
    const epoch = accountEpoch.current
    setSocialBusyId(visitedPlanet.id)
    setSocialError('')
    setSocialFeedback('')
    try {
      const result = await api.createFriendRequest(visitedPlanet.id)
      if (epoch !== accountEpoch.current) return
      setSocialFeedback(result.request.status === 'accepted'
        ? '已成为好友，你们已出现在彼此的好友 Orbit 中。'
        : '好友请求已发送；对方接受后，你们会出现在彼此的好友 Orbit 中。')
      await social.refresh()
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      const code = error instanceof MusicApiError ? error.code : ''
      setSocialError(code === 'REQUEST_ALREADY_PENDING' ? '好友请求已发送，正在等待对方回应。'
        : code === 'ALREADY_FRIENDS' ? '你们已经是好友了。'
          : code === 'FRIEND_REQUESTS_DISABLED' ? '对方暂不接收好友请求。'
            : code === 'REQUEST_REJECTED' ? '对方此前拒绝过此请求，当前不能再次发送。'
              : code === 'USER_BLOCKED' ? '无法向此用户发送好友请求。'
                : '好友请求没有发送成功，请稍后重试。')
      await social.refresh()
    } finally {
      if (epoch === accountEpoch.current) setSocialBusyId('')
    }
  }

  const blockVisitedPlanet = async () => {
    if (!visitedPlanet || blockingPlanetId) return
    if (!blockConfirm) { setBlockConfirm(true); return }
    setBlockConfirm(false)
    const planetId = visitedPlanet.id
    const epoch = accountEpoch.current
    setBlockingPlanetId(planetId)
    setSocialError('')
    try {
      await api.blockPlanet(planetId)
      if (epoch !== accountEpoch.current) return
      invalidateSocialDiscovery()
      setConversation(null)
      await social.refresh()
      if (epoch !== accountEpoch.current) return
      setVisitedPlanet(null)
      dispatchCockpit({ type: 'exterior', destination: 'home' })
      setView('settings')
      void loadSettings()
      setSocialFeedback('已屏蔽此星主；双方将不再出现在彼此的发现与 Orbit 中。')
      if (view === 'orbit') void loadOrbit()
    } catch {
      if (epoch !== accountEpoch.current) return
      setSocialError('暂时无法屏蔽此用户，请稍后重试。')
    } finally {
      if (epoch === accountEpoch.current) setBlockingPlanetId('')
    }
  }

  const loadGalaxy = async (by: GalaxyGroupBy, newDay = false) => {
    const epoch = accountEpoch.current
    const requestId = ++galaxyRequestId.current
    const previous = newDay ? undefined : galaxy.status === 'ready' ? galaxy.response : galaxy.status === 'loading' ? galaxy.previous : undefined
    setGalaxy({ status: 'loading', by, ...(previous ? { previous } : {}) })
    try {
      const response = await galaxyPreloader.load(by)
      if (!Array.isArray(response.groups)) throw new Error('Invalid Galaxy response')
      if (epoch !== accountEpoch.current || requestId !== galaxyRequestId.current) return false
      setGalaxy({ status: 'ready', by, response, selectedGroupKey: null })
      setGalaxyJourney(0)
      setGalaxyRotation(0)
      return true
    } catch {
      if (epoch !== accountEpoch.current || requestId !== galaxyRequestId.current) return false
      if (previous) setGalaxy({ status: 'ready', by: previous.by, response: previous, selectedGroupKey: null })
      else setGalaxy({ status: 'error', by })
      return false
    }
  }

  const regroupGalaxy = async (by: GalaxyGroupBy) => {
    if (galaxy.status === 'loading' || galaxy.status === 'ready' && galaxy.by === by) return
    const epoch = accountEpoch.current
    const requestId = ++galaxyRequestId.current
    const previous = galaxySceneResponse
    setGalaxyRegrouping(false)
    setGalaxy({ status: 'loading', by, ...(previous ? { previous } : {}) })
    setVisitError('')
    try {
      const response = await galaxyPreloader.load(by)
      if (epoch !== accountEpoch.current || requestId !== galaxyRequestId.current) return
      setGalaxyRegrouping(true)
      await new Promise((resolve) => window.setTimeout(resolve, 140))
      if (epoch !== accountEpoch.current || requestId !== galaxyRequestId.current) return
      setGalaxy({ status: 'ready', by, response, selectedGroupKey: null })
      setGalaxyJourney(0)
      setGalaxyRotation(0)
      await new Promise((resolve) => window.setTimeout(resolve, 220))
    } catch {
      if (epoch !== accountEpoch.current || requestId !== galaxyRequestId.current) return
      if (previous) {
        setGalaxy({ status: 'ready', by: previous.by, response: previous, selectedGroupKey: null })
        setVisitError('新的分类暂时无法载入，已保留原来的星系排列。')
      } else setGalaxy({ status: 'error', by })
    } finally {
      if (epoch === accountEpoch.current && requestId === galaxyRequestId.current) setGalaxyRegrouping(false)
    }
  }

  // The windshield is the public universe, not the personal terminal's page.
  // Fetch once after identity is ready; failures remain retryable, and the
  // existing account/request guards prevent a stale universe crossing accounts.
  useEffect(() => {
    if (home.status === 'ready' && galaxy.status === 'idle') {
      galaxyPreloader.warm()
      void loadGalaxy('genre')
    }
  }, [home.status, galaxy.status])

  const prefetchGalaxyResponse = galaxy.status === 'ready' ? galaxy.response : undefined
  useEffect(() => {
    if (!prefetchGalaxyResponse) return
    return scheduleMusicPrefetch(prefetchGalaxyResponse.groups.slice(0, 2).map(group =>
      () => api.loadGalaxyContent(prefetchGalaxyResponse.by, group.key)))
  }, [api, prefetchGalaxyResponse])

  const focusGalaxyGroup = (groupKey: string) => {
    if (galaxy.status !== 'ready') return
    const groupIndex = galaxy.response.groups.findIndex((group) => group.key === groupKey)
    if (groupIndex < 0) return
    setGalaxy({ ...galaxy, selectedGroupKey: groupKey })
  }

  const focusGalaxyById = (id: string) => {
    const system = galaxySceneSystems.find((item) => item.id === id)
    if (system) { focusGalaxyGroup(system.key); setGalaxyWindowOpen(true) }
  }

  const loadDiscovery = async () => {
    const epoch = accountEpoch.current
    const requestId = ++discoveryRequestId.current
    setDiscovery({ status: 'loading' })
    try {
      const response = await api.loadDiscovery()
      if (epoch !== accountEpoch.current || requestId !== discoveryRequestId.current) return
      setDiscovery({ status: 'ready', response })
    } catch {
      if (epoch !== accountEpoch.current || requestId !== discoveryRequestId.current) return
      setDiscovery({ status: 'error' })
    }
  }

  const loadOrbit = async () => {
    const epoch = accountEpoch.current
    const requestId = ++orbitRequestId.current
    setOrbit({ status: 'loading' })
    setSocialError('')
    try {
      const response = await api.loadOrbit()
      if (epoch !== accountEpoch.current || requestId !== orbitRequestId.current) return
      setOrbit({ status: 'ready', response })
    } catch {
      if (epoch !== accountEpoch.current || requestId !== orbitRequestId.current) return
      setOrbit({ status: 'error' })
    }
  }

  useEffect(() => {
    if (home.status !== 'ready') return
    if (view === 'roam' && discovery.status === 'idle') void loadDiscovery()
    if (view === 'orbit' && orbit.status === 'idle') void loadOrbit()
  }, [view, home.status, discovery.status, orbit.status])

  useDailyRollover(home.status === 'ready', () => {
    galaxyPreloader.clear()
    galaxyPreloader.warm()
    discoveryRequestId.current++ // Late responses from yesterday cannot restore the old list.
    setDiscovery({ status: 'idle' })
    setGalaxyWindowOpen(false)
    setGalaxyRegrouping(false)
    void loadGalaxy(galaxy.status === 'idle' ? 'genre' : galaxy.by, true)
    void reloadFriendSatellites()
  })

  const loadSettings = async () => {
    const epoch = accountEpoch.current
    setSettingsStatus('loading')
    setSettingsError('')
    try {
      const [settings, preferences] = await Promise.all([api.loadSocialSettings(), api.loadGalaxyPreferences()])
      if (epoch !== accountEpoch.current) return
      setSocialSettings(settings)
      setGalaxyGenres(preferences.genres); setGenreDraft(preferences.genres)
      setGalaxyArtists(preferences.artists ?? []); setGalaxySongs(preferences.songs ?? [])
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
    const requestId = ++satelliteRefreshId.current
    setFriendSatelliteError('')
    try {
      const { friendSatellites } = await api.loadFriendSatellites()
      if (epoch !== accountEpoch.current || requestId !== satelliteRefreshId.current) return
      setHome((current) => current.status === 'ready' ? { ...current, friendSatellites } : current)
    } catch {
      if (epoch !== accountEpoch.current || requestId !== satelliteRefreshId.current) return
      setFriendSatelliteError('好友卫星暂时没有读取成功，请重试。')
    }
  }

  const liveFriendIds = social.snapshot?.friends.map(friend => friend.userId).sort().join('|')
  const liveFriendActivity = social.snapshot?.friends.map(friend => `${friend.userId}:${friend.lastMessageAt ?? ''}`).sort().join('|')
  const previousFriends = useRef<{ epoch: number; ids: string[] } | null>(null)
  useEffect(() => {
    if (liveFriendIds === undefined) { previousFriends.current = null; return }
    const ids = social.snapshot!.friends.map(friend => friend.userId)
    const previous = previousFriends.current
    previousFriends.current = { epoch: accountEpoch.current, ids }
    if (previous?.epoch === accountEpoch.current && previous.ids.some(id => !ids.includes(id))) {
      invalidateSocialDiscovery()
      setConversation(current => current && !ids.includes(current.userId) ? null : current)
    }
    void reloadFriendSatellites()
  }, [liveFriendIds, liveFriendActivity])

  const relationshipEpoch = accountEpoch.current
  const handleFriendChange = async (change: FriendChange) => {
    if (relationshipEpoch !== accountEpoch.current) return
    invalidateSocialDiscovery()
    if (change.action !== 'unblock') setConversation(current => current?.userId === change.userId ? null : current)
    if (change.action === 'block' && visitedPlanet && (visitedPlanet.id === change.planetId || visitedFriend?.userId === change.userId)) {
      returnVisitors.current = []
      setVisitedPlanet(null)
      dispatchCockpit({ type: 'exterior', destination: 'home' })
    }
    social.dismiss()
    await social.refresh()
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

  const saveGalaxyGenres = async () => {
    if (settingsSaving) return
    const epoch = accountEpoch.current
    setSettingsSaving('galaxy-genres'); setSettingsError('')
    try {
      const result = await api.updateGalaxyPreferences(genreDraft)
      if (epoch !== accountEpoch.current) return
      setGalaxyGenres(result.genres); setGenreDraft(result.genres)
      galaxyPreloader.clear('genre')
      await loadGalaxy('genre')
    } catch { if (epoch === accountEpoch.current) setSettingsError('曲风设置未保存，请重试。') }
    finally { if (epoch === accountEpoch.current) setSettingsSaving('') }
  }

  const saveGalaxySelections = async (kind: GalaxySelectionKind, ids: string[]) => {
    if (settingsSaving) return false
    const epoch = accountEpoch.current
    setSettingsSaving(`galaxy-${kind}`); setSettingsError('')
    try {
      await api.updateGalaxyPreferences(kind === 'artist' ? { artists: ids } : { songs: ids })
      const confirmed = await api.loadGalaxyPreferences()
      if (epoch !== accountEpoch.current) return false
      const selections = kind === 'artist' ? confirmed.artists : confirmed.songs
      if (JSON.stringify(selections.map(o => o.id)) !== JSON.stringify(ids)) throw new Error('Preference readback mismatch')
      setGalaxyArtists(confirmed.artists); setGalaxySongs(confirmed.songs)
      galaxyPreloader.clear(kind)
      const refreshed = await loadGalaxy(kind)
      if (epoch === accountEpoch.current && !refreshed) setSettingsError('设置已保存，但星系刷新失败，请重新进入 Galaxy。')
      return true
    } catch { if (epoch === accountEpoch.current) setSettingsError('艺人／歌曲设置未确认保存，请重试。'); return false }
    finally { if (epoch === accountEpoch.current) setSettingsSaving('') }
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
      if ([...confirmedTrackIds].sort().join('\u0000') !== [...currentTrackIds].sort().join('\u0000')) {
        // Invalidate pending responses as well as the cached route for the old song set.
        discoveryRequestId.current++
        setDiscovery({ status: 'idle' })
      }
      setPlanetEditTrackIds(confirmedTrackIds)
      setPlanetEditPrimaryTrackId(result.planet.tracks.find((track) => track.isPrimary)?.id ?? confirmedTrackIds[0] ?? '')
      setPlanetEditFeedback('星球资料与外观已保存。')
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
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMomentManagement((current) => current.status === 'confirm-delete' && current.momentId === currentDelete.momentId
        ? { ...current, busy: false, error: errorMessage(error) }
        : current)
    }
  }

  const respondToFriendRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (socialBusyId) return
    const epoch = accountEpoch.current
    setSocialBusyId(requestId)
    setSocialError('')
    setSocialFeedback('')
    try {
      await api.respondFriendRequest(requestId, action)
      if (epoch !== accountEpoch.current) return
      setSocialFeedback(action === 'accept' ? '已接受好友请求。现在可以在 My Orbit 中私信。' : '已拒绝好友请求。')
      await social.refresh()
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setSocialError(error instanceof MusicApiError && error.code === 'USER_BLOCKED'
        ? '这段关系已被屏蔽，无法建立好友关系。'
        : '好友请求状态已变化，正在自动同步最新状态。')
      await social.refresh()
    } finally {
      if (epoch === accountEpoch.current) setSocialBusyId('')
    }
  }

  const openConversation = (userId: string, displayName: string) => setConversation({ userId, displayName })

  const changeView = (next: ProductView) => {
    // Opening a channel restores its existing results; only an explicit song
    // action may start a new search and replace the middle monitor's snapshot.
    if (next === 'copilot') setCopilotNotice(null)
    setView(next)
    if (next === 'galaxy' && galaxy.status === 'idle') void loadGalaxy('genre')
    if (next === 'roam') {
      if (discovery.status === 'idle') void loadDiscovery()
    }
    if (next === 'orbit') {
      void loadOrbit()
      void social.refresh()
    }
    if (next === 'bottles') setBottlesMounted(true)
    if (next === 'settings' && settingsStatus === 'idle') void loadSettings()
    if (next === 'manage') {
      if (!profileInitialized.current) {
        profileInitialized.current = true
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
  const moveGalaxyJourney = (step: number) => {
    if (!Number.isFinite(step) || !step) return
    homeWheelApproach.current = 0
    setHomeAxisApproach(0)
    const progress = galaxyJourneyRef.current
    const nextProgress = Math.max(0, Math.min(TOUR_END, progress + step))
    setGalaxyJourney(nextProgress)
    if (reachesTourHomeEndpoint(progress, step)) goHomeRef.current()
  }
  const homeWheelApproach = useRef(0)
  const [homeAxisApproach, setHomeAxisApproach] = useState(0)
  useEffect(() => {
    homeWheelApproach.current = 0
    setHomeAxisApproach(0)
  }, [cockpit.exterior, cockpit.console.focus, galaxy.status === 'idle' ? undefined : galaxy.by])

  useEffect(() => {
    if (projectionOpen || cockpit.exterior !== 'galaxy' || cockpit.console.focus !== 'overview' || cockpit.travel.status !== 'idle' || galaxy.status !== 'ready') return
    const onWheel = (event: WheelEvent) => {
      const target = event.target
      if (target instanceof Element) {
        if (!target.closest('.cockpit-viewport') || target.closest('button, input, textarea, select, .window-hud-terminal')) return
      }
      const viewport = document.querySelector<HTMLElement>('.music-app')
      const step = normalizeWheelDelta(event.deltaY, event.deltaMode, viewport ? logicalSize(viewport).height : window.innerHeight)
      if (!step) return
      event.preventDefault()
      const next = advanceGalaxyWheel(galaxyJourneyRef.current, step, homeWheelApproach.current)
      homeWheelApproach.current = next.approach
      setHomeAxisApproach(next.approach)
      setGalaxyJourney(next.journey)
      if (next.enterHome) goHomeRef.current()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [galaxy.status, cockpit.exterior, cockpit.console.focus, cockpit.travel.status, projectionOpen])

  const collisionPlanet = cockpit.exterior === 'visitor' ? visitedPlanet : planet
  const panelPlanet = view === 'collision' ? collisionPlanet : planet
  const canOpenSongPortal = (trackId: string) => Boolean(collisionPlanet?.tracks.some((track) => track.id === trackId)
    || cockpit.exterior !== 'visitor' && moments.some((moment) => moment.trackId === trackId && moment.visibility === 'public'))

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
    if (!planet || !momentTrackId || savingMoment || momentPhotoFeedback) return
    const epoch = accountEpoch.current
    setSavingMoment(true)
    setMomentFeedback('')
    try {
      const result = await api.createMoment({
        trackId: momentTrackId,
        contentText: momentText.trim(),
        visibility: momentPrivate ? 'private' : 'public',
        ...(momentPhoto ? { photo: momentPhoto } : {}),
      })
      if (epoch !== accountEpoch.current) return
      if (!result.moment) throw new Error('Moment save was not confirmed')
      setHome((current) => current.status === 'ready'
        ? { ...current, moments: [result.moment!, ...current.moments] }
        : current)
      setMomentText('')
      setMomentPhoto(null)
      setMomentPhotoFeedback('')
      setMomentFeedback(result.moment.visibility === 'private' ? '已保存为仅自己可见。' : 'Moment 已公开。')
    } catch (error) {
      if (epoch !== accountEpoch.current) return
      setMomentFeedback(errorMessage(error))
    } finally {
      if (epoch === accountEpoch.current) setSavingMoment(false)
    }
  }

  const closeAppearance = () => { if (appearanceBusy) return; setAppearanceOpen(false); setAppearancePreview(null); setAppearanceError('') }
  const reloadAppearance = async () => {
    if (appearanceBusy) return
    const epoch = accountEpoch.current
    setAppearanceBusy(true)
    try {
      const result = await api.loadHome()
      if (epoch !== accountEpoch.current) return
      if (!result.planet) throw new Error('Planet not available')
      setHome(current => current.status === 'ready' ? { ...current, planet: result.planet } : current)
      setAppearanceError('已读取最新版本。你的手动调整仍保留，确认预览后可再次应用。')
    } catch { if (epoch === accountEpoch.current) setAppearanceError('重新读取失败，当前预览仍保留。') }
    finally { if (epoch === accountEpoch.current) setAppearanceBusy(false) }
  }
  const applyAppearance = async (appearanceOverrides: DitherOverrides) => {
    if (!planet || appearanceBusy) return
    const epoch = accountEpoch.current
    setAppearanceBusy(true); setAppearanceError('')
    try {
      const result = await api.updateMusicPlanet({ appearanceOverrides, appearanceRevision: planet.appearanceRevision ?? 0 })
      if (epoch !== accountEpoch.current) return
      setHome(current => current.status === 'ready' ? { ...current, planet: result.planet } : current)
      setAppearanceOpen(false); setAppearancePreview(null); setView('planet')
    } catch (cause) {
      if (epoch !== accountEpoch.current) return
      setAppearanceError(cause instanceof MusicApiError && cause.code === 'APPEARANCE_CONFLICT' ? '外观已在其他窗口更新。当前预览已保留，请重新读取已保存版本后再应用。' : '外观未保存，预览与填写仍保留。请重试。')
    } finally { if (epoch === accountEpoch.current) setAppearanceBusy(false) }
  }

  const homeReady = home.status === 'ready'
  const canCreate = home.status === 'ready' && !planet
  const goGalaxy = async () => {
    const token = flightController.start({ from: cockpit.exterior, to: 'galaxy', ready: false, sourceVisitor: visitedPlanet, targetVisitor: null, returning: false })
    if (token === null) return
    dispatchCockpit({ type: 'depart', token, target: 'galaxy' })
    {
      const success = await loadGalaxy(galaxy.status === 'idle' ? 'genre' : galaxy.by)
      if (flightController.isCurrent(token)) {
        if (success) { flightController.ready(token); dispatchCockpit({ type: 'ready', token }) }
        else { flightController.cancel(); dispatchCockpit({ type: 'cancel', token }); changeView('galaxy') }
      }
    }
  }
  const startHomeFlight = (returning: boolean) => {
    const target = returning ? cockpit.origins.at(-1)?.exterior ?? 'home' : 'home'
    const token = flightController.start({ from: cockpit.exterior, to: target, ready: true, sourceVisitor: visitedPlanet, targetVisitor: returning ? returnVisitors.current.at(-1) ?? null : null, returning })
    if (token !== null) dispatchCockpit(returning ? { type: 'return', token } : { type: 'depart', token, target: 'home' })
  }
  const goHome = () => startHomeFlight(cockpit.exterior === 'visitor')
  const jumpHome = () => startHomeFlight(false)
  goHomeRef.current = goHome
  const signal = home.status === 'error' ? 'error' : !homeReady ? 'loading' : cockpit.travel.status !== 'idle' ? 'traveling' : visitError || galaxy.status === 'error' ? 'error' : songPortal.status === 'loading' || galaxy.status === 'loading' || discovery.status === 'loading' ? 'loading' : 'idle'
  const playingMetadata = [...(visitedPlanet?.tracks ?? []), ...(planet?.tracks ?? []), ...tracks].find(track => track.id === musicPlayer.currentTrackId)
  const monitorVisitor = cockpit.exterior === 'visitor' ? visitedPlanet : null
  const monitorPlanet = monitorVisitor ?? planet
  const monitorTrack = monitorVisitor ? monitorVisitor.tracks.find(track => track.id === musicPlayer.currentTrackId) : playingMetadata
  const scanSignals = copilotPlanets.length && songPortal.status === 'idle' ? copilotPlanets : songPortal.status === 'ready' ? songPortal.response.matches : songPortal.status === 'idle' && discovery.status === 'ready' ? discovery.response.recommendations : []
  const scanTitle = copilotPlanets.length && songPortal.status === 'idle' ? '副驾发现' : songPortal.status === 'ready' ? 'SCAN RESULTS' : songPortal.status === 'loading' ? 'SCANNING' : songPortal.status === 'error' ? 'SCAN FAILED' : cockpit.exterior === 'visitor' ? visitedPlanet?.displayName ?? 'SYSTEM ON' : cockpit.exterior === 'galaxy' ? selectedGalaxyGroup?.label ?? 'SYSTEM ON' : 'SYSTEM ON'
  const socialNotice = social.notice && <div className="music-social-notice" aria-label="好友动态">
    <p role="status">{social.notice}</p>
    <DitherButton type="button" disabled={cockpit.travel.status !== 'idle'} onClick={() => { social.dismiss(); changeView('orbit') }}>{friendRequests?.incoming.length ? '查看好友请求' : '查看好友'}</DitherButton>
    <DitherButton type="button" className="music-text-button" aria-label="关闭好友通知" onClick={social.dismiss}>×</DitherButton>
  </div>

  const saveFirstRunPreferences = async (patch: GalaxyPreferencesPatch) => {
    if (!homeReady) throw new Error('个人信号还未接通，请稍后重试。')
    const epoch = accountEpoch.current
    const saved = await api.updateGalaxyPreferences(patch)
    if (epoch !== accountEpoch.current) throw new Error('本机身份已切换，请重新打开引导。')
    for (const field of ['artists', 'songs'] as const) {
      if (patch[field] && JSON.stringify(saved[field].map(option => option.id)) !== JSON.stringify(patch[field]))
        throw new Error('偏好回读不一致，请重试保存。')
    }
    if (patch.genres && JSON.stringify(saved.genres) !== JSON.stringify(patch.genres))
      throw new Error('曲风回读不一致，请重试保存。')
    setGalaxyGenres(saved.genres); setGenreDraft(saved.genres)
    setGalaxyArtists(saved.artists); setGalaxySongs(saved.songs)
    galaxyPreloader.clear(); galaxyRequestId.current++
    setGalaxy({ status: 'idle' })
    return saved
  }
  const createFirstRunPlanet = async (draft: MusicPlanetDraft) => {
    if (!homeReady || firstRunCreateLock.current) throw new Error('请等待当前保存完成。')
    if (!validatePlanetDraft(draft.displayName, draft.trackIds).ok) throw new Error('请填写名称，并选择三首不同的歌曲。')
    const epoch = accountEpoch.current
    firstRunCreateLock.current = true
    try {
      const result = await api.createPlanet(draft)
      if (epoch !== accountEpoch.current) throw new Error('本机身份已切换，请重新打开引导。')
      setHome(current => current.status === 'ready' ? { ...current, planet: result.planet, moments: [] } : current)
      setMomentTrackId(result.planet.tracks.find(track => track.isPrimary)?.id ?? result.planet.tracks[0]?.id ?? '')
      return result.planet
    } catch (cause) {
      if (epoch === accountEpoch.current && cause instanceof MusicApiError && cause.code === 'PLANET_ALREADY_EXISTS') void reloadHome()
      throw new Error(errorMessage(cause))
    } finally { if (epoch === accountEpoch.current) firstRunCreateLock.current = false }
  }
  const rememberFirstRunFinished = () => {
    // Persist the explicit finish/skip click before the TV exit animation, never on opening.
    try { localStorage.setItem(firstRunStorageKey, 'completed') } catch { /* This visit is still fully usable. */ }
  }
  const finishFirstRun = (destination?: 'galaxy' | 'planet' | 'collision' | 'moment' | 'orbit') => {
    setFirstRunOpen(false)
    dispatchCockpit({ type: 'overview' })
    if (homeReady && destination) {
      if (destination === 'galaxy' || destination === 'planet') dispatchCockpit({ type: 'exterior', destination: destination === 'planet' ? 'home' : 'galaxy' })
      if (destination !== 'galaxy') changeView(destination)
    }
  }

  return <main className={`music-app${planet ? ' has-planet' : ' is-onboarding'}`} aria-busy={!homeReady || undefined}>
    <div ref={cockpitRoot} className="music-cockpit-root" inert={firstRunOpen || !homeReady || undefined} aria-hidden={firstRunOpen || undefined}>
    {cockpit.console.focus === 'overview' && socialNotice}
    <CockpitShell state={cockpit} connected={homeReady} reducedMotion={reducedMotion} crtEnabled={crtEnabled} signal={signal} musicPlayer={musicPlayer}
      terminalActions={visitedPlanet && cockpit.exterior === 'visitor' ? <button aria-label="返回出发地" disabled={cockpit.travel.status !== 'idle'} onClick={goHome}>← 返回出发地</button> : undefined}
      galaxyLabel={hudSystem?.label}
      planetName={planet?.displayName ?? '待命星球'} heading={Math.min(1, galaxyJourney / TOUR_END)}
      flightSpeed={getFlightSpeed(flightController.flight)}
      flight={flightController.flight}
      telemetry={{ ownerId: planet?.id ?? null, systemCount: galaxySceneResponse ? galaxySceneSystems.length : null, sectorPosition: hudTour.systemIndex,
        grouping: galaxySceneResponse?.by ?? 'genre',
        sector: hudSector,
        orbitRotation: null,
        visitor: visitedPlanet ? { id: visitedPlanet.id, name: visitedPlanet.displayName } : null,
        targetName: flightController.flight?.targetVisitor?.displayName ?? (flightController.flight?.to === 'visitor' ? pendingVisit?.displayName ?? null : null) }}
      by={galaxy.status === 'idle' ? 'genre' : galaxy.by} onClassify={by => { void regroupGalaxy(by) }}
      classifying={galaxy.status === 'loading' || galaxyRegrouping}
      projection={homeReady && <CopilotProjection active={projectionOpen} phase={copilotPhase} reducedMotion={reducedMotion}
        visible={!firstRunOpen && cockpit.console.focus === 'overview' && cockpit.travel.status === 'idle'}
        open={() => changeView('copilot')} close={() => dispatchCockpit({ type: 'overview' })}
        toggle={() => copilotIntercom.current?.toggle()} begin={() => copilotIntercom.current?.begin()} end={() => copilotIntercom.current?.end()} cancel={() => copilotIntercom.current?.cancel()}
        notice={copilotNotice?.text ?? ''} onDismiss={() => setCopilotNotice(null)}
        onNotice={() => { changeView(copilotNotice?.page ?? 'copilot'); setCopilotNotice(null) }}>
        <CopilotPanel key={accountEpoch.current}
        active={projectionOpen} onPhaseChange={setCopilotPhase} onClose={() => dispatchCockpit({ type: 'overview' })} intercomRef={copilotIntercom}
        player={musicPlayer} currentTrackId={musicPlayer.currentTrackId} currentPlanetId={monitorPlanet?.id}
        currentView={cockpit.exterior} onPlay={musicPlayer.play} onDuckChange={musicPlayer.setDucked}
        onVisit={(id, name) => requestPublicPlanetVisit(id, name, 'direct')}
        onInitiativeChange={setInitiative} onPlanetsChange={setCopilotPlanets}
        onDraftBottle={text => { setBottleDraft({ text, trackId: musicPlayer.currentTrackId }); changeView('bottles') }} />
      </CopilotProjection>}
      onOpen={changeView} onOverview={() => dispatchCockpit({ type: 'overview' })} onBack={() => dispatchCockpit({ type: 'back' })}
      onGalaxy={() => { void goGalaxy() }} onHome={jumpHome}
      personalPreview={cockpit.exterior === 'galaxy' ? <GalaxyTelemetry grouping={galaxySceneResponse?.by ?? (galaxy.status === 'idle' ? 'genre' : galaxy.by)}
        systemCount={galaxySceneResponse ? galaxySceneSystems.length : null} sector={hudSector} status={galaxy.status === 'ready' ? 'ready' : galaxy.status === 'error' ? 'error' : 'loading'} />
        : <PersonalTelemetry context={monitorVisitor ? 'visitor' : 'personal'} planetName={monitorPlanet?.displayName ?? '创建我的星球'} planetId={monitorPlanet?.id} visual={monitorPlanet?.visual}
        songs={monitorPlanet?.tracks.length ?? 0} moments={monitorVisitor ? monitorVisitor.moments.length : momentsLoading ? null : moments.length}
        bpm={musicPlayer.currentTrackId === DEFAULT_TRACK_ID && (!monitorVisitor || monitorTrack) ? COSMOS_BEAT.bpm : monitorTrack?.visualFeatures?.tempoBpm}
        durationSeconds={monitorTrack?.durationSeconds} trackTitle={monitorVisitor ? monitorTrack?.title ?? '暂无播放歌曲' : musicPlayer.currentTrack.title} requests={friendRequests?.incoming.length} />}
      explorationPreview={<SignalMap signals={scanSignals} title={scanTitle} scanning={songPortal.status === 'loading' || songPortal.status === 'ready'} mode={songPortal.status === 'ready' || songPortal.status === 'loading' ? 'SONG LINK' : discovery.status === 'ready' ? 'ROAM LINK' : 'EXPLORATION / NAV'} />}
      scene={<Stage
      planet={planet} friendSatellites={home.status === 'ready' ? home.friendSatellites : []} visitedPlanet={cockpit.exterior === 'visitor' ? visitedPlanet : null} previewSeed={previewSeed} reducedMotion={reducedMotion}
      exteriorView={cockpit.exterior === 'galaxy' ? 'galaxy' : 'home'} interactive={homeReady && !firstRunOpen && !projectionOpen && cockpit.console.focus === 'overview' && cockpit.travel.status === 'idle'} managedTravel flight={flightController.flight}
      productView={view} galaxySystems={galaxySceneSystems}
      galaxyRotation={galaxyRotation} routeJourney={galaxyJourney} regrouping={galaxyRegrouping}
      onSelectGalaxy={focusGalaxyById}
      onPlanetSelect={kind => changeView(kind === 'home' ? 'planet' : 'visitor')}
      onOpenPlanet={(scenePlanet, _galaxyId) => requestPublicPlanetVisit(scenePlanet.id, scenePlanet.alias, 'galaxy')}
      previewTracks={tracks.filter(track => selectedTrackIds.includes(track.id))}
      appearancePreview={appearancePreview}
      onMusicSelect={id => { setFocusedTrackId(id); changeView(cockpit.exterior === 'visitor' ? 'visitor' : 'orbit') }}
      onTourMove={moveGalaxyJourney}
      onFriendSelect={(id) => {
        if (cockpit.exterior === 'visitor') {
          const friend = visitedPlanet?.friendSatellites?.find(f => f.id === id)
          if (!friend?.planetId) return
          if (friend.planetId === planet?.id) jumpHome()
          else requestPublicPlanetVisit(friend.planetId, friend.displayName, 'orbit')
          return
        }
        const friend = home.status === 'ready' ? home.friendSatellites.find(f => f.id === id) : undefined
        changeView('orbit'); if (friend) setSocialFeedback(friend.displayName)
      }}
      onRotate={(delta) => setGalaxyRotation((rotation) => rotation + delta)}
    />}
      windowNavigation={<>{!projectionOpen && cockpit.exterior === 'galaxy' && galaxy.status === 'ready' && <MusicGalaxyAxis
      systems={galaxySceneSystems} journey={galaxyJourney} homeApproach={homeAxisApproach} reducedMotion={reducedMotion}
      onSelect={(index) => {
        homeWheelApproach.current = 0; setHomeAxisApproach(0)
        animateGalaxyJourney(getTourAnchorProgress(index, galaxySceneSystems.length) * TOUR_END, galaxySceneSystems.length)
      }}
      onHome={goHome}
    />}
    </>}>

    {cockpit.console.focus !== 'overview' && socialNotice}
    <div className="cockpit-pages">

      {musicPlayer.error && <p className="music-form-error" role="alert">{musicPlayer.error}</p>}
      {view === 'planet' && <section className="cockpit-personal-heading"><DitherTitle level={2}>{planet?.displayName ?? '创建我的星球'}</DitherTitle>{planet?.tagline && <p>{planet.tagline}</p>}
        {planet && <div className="cockpit-page-actions"><DitherButton onClick={() => changeView('manage')}>星球资料与歌曲</DitherButton><DitherButton aria-label="编辑星球外观" onClick={() => { setAppearanceError(''); setAppearanceOpen(true); changeView('appearance') }}>调整外观</DitherButton></div>}
        <SongWall tracks={planet?.tracks ?? tracks.filter(t=>selectedTrackIds.includes(t.id))} selectedId={focusedTrackId ?? planet?.tracks.find(track=>track.isPrimary)?.id} onSelect={setFocusedTrackId} player={musicPlayer} />
      </section>}
      {appearanceOpen && activeVisual && <div hidden={view !== 'appearance'}><AppearanceEditor embedded active={view === 'appearance' && cockpit.console.focus !== 'overview'} reducedMotion={reducedMotion} spec={activeVisual} tracks={planet?.tracks} busy={appearanceBusy} error={appearanceError} onPreview={setAppearancePreview} onApply={(overrides)=>{void applyAppearance(overrides)}} onClose={() => { closeAppearance(); changeView('planet') }} onReload={()=>{void reloadAppearance()}} /></div>}

      {canCreate && view === 'planet' ? <aside className="music-panel music-create-panel" aria-label="创建音乐星球">
        {!tracks.length ? <div className="music-empty-catalog" role="status">
          <span className="music-kicker">曲库 · 暂未开放</span>
          <DitherTitle level={2}>曲库还没有可选歌曲</DitherTitle>
          <p>添加曲目后，你就可以开始创建星球。有可用音源的歌曲可以直接在站内播放。</p>
        </div> : <form onSubmit={createPlanet}>
          <div className="music-panel-head"><DitherTitle level={2}>为你的星球选三首歌</DitherTitle></div>
          <p className="music-panel-note">星球默认公开，可随时关闭。Cosmos 可在电台直接播放。</p>
          <AudiusCdPicker api={api} onTracks={mergeCatalogTracks} tracks={tracks} selectedIds={selectedTrackIds} onToggle={toggleTrack} query={query} onQuery={setQuery}
            searchId="music-track-search" max={3} min={0} disabled={creatingPlanet} reducedMotion={reducedMotion} player={musicPlayer} />
          <div className="music-fields">
            <label htmlFor="music-planet-name">星球名称</label>
            <input id="music-planet-name" value={displayName} maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="给这颗星球起个名字" required />
            <label htmlFor="music-planet-tagline">一句星球简介（可选）</label>
            <input id="music-planet-tagline" value={tagline} maxLength={120} onChange={(event) => setTagline(event.target.value)} placeholder="例如：慢慢靠岸，也不必急着抵达" />
          </div>
          <label className="music-visibility-toggle"><input type="checkbox" checked={!planetPrivate} onChange={(event) => setPlanetPrivate(!event.target.checked)} /> <span><strong>允许在 Galaxy 中访问</strong><small>默认公开；之后可在设置中关闭。</small></span></label>
          {draftError && <p className="music-form-error" role="alert">{draftError}</p>}
          <DitherButton className="music-primary-button music-submit" type="submit" disabled={creatingPlanet || tracks.length < 3 || selectedTrackIds.length !== 3 || !displayName.trim()}>
            {creatingPlanet ? '正在保存星球…' : '生成我的星球'} <span aria-hidden="true">↗</span>
          </DitherButton>
          <p className="music-privacy-note">公开给访客的 Moment 单独标记；星球外观只使用选歌参数，不读取 Moment 内容。</p>
        </form>}
      </aside> : null}

      {(view === 'settings' || view === 'manage') && <aside className="music-panel music-settings-panel" aria-label={view === 'manage' ? '星球资料与歌曲' : '设置'}>
        {view === 'settings' && <>
        <div className="music-panel-head"><div><span className="music-kicker">Mosic · 账户偏好</span><DitherTitle level={2}>设置</DitherTitle></div></div>
        <p className="music-panel-note">星球访问权限与接收偏好彼此独立。公开星球会出现在 Galaxy；每条 Moment 也可以单独设为仅自己可见。</p>
        {settingsStatus === 'loading' && <DitherLoadingRing label="正在读取已保存的设置…" />}
        {settingsError && <p className="music-form-error" role="alert">{settingsError}</p>}
        {settingsStatus === 'error' && <DitherButton className="music-text-button" type="button" onClick={() => { void loadSettings() }}>重新读取设置</DitherButton>}
        <label className="music-visibility-toggle"><input type="checkbox" aria-label="CRT 效果" checked={crtEnabled} onChange={e => { setCrtEnabled(e.target.checked); try { localStorage.setItem('moodverse-crt', e.target.checked ? 'on' : 'off') } catch { /* This session can still toggle effects without storage. */ } }} /><span><strong>CRT 效果</strong><small>减少动态效果时自动关闭闪动。</small></span></label>
        <DitherButton type="button" onClick={() => setFirstRunOpen(true)}>重播首次调频</DitherButton>
        </>}
        {planet && view === 'manage' && <form className="music-settings-planet-form" aria-label="编辑星球资料" onSubmit={savePlanetSettings}>
          <section className="music-settings-section" aria-label="星球资料与歌曲">
            <div className="music-section-heading"><DitherTitle level={3}>星球资料与歌曲</DitherTitle><span>可随时调整</span></div>
            <div className="music-fields">
              <label htmlFor="music-settings-planet-name">星球名称</label>
              <input id="music-settings-planet-name" aria-label="星球名称" value={planetEditName} maxLength={40} disabled={Boolean(settingsSaving)} onChange={(event) => { setPlanetEditName(event.target.value); setPlanetEditError(''); setPlanetEditFeedback('') }} />
              <label htmlFor="music-settings-planet-tagline">星球简介</label>
              <input id="music-settings-planet-tagline" aria-label="星球简介" value={planetEditTagline} maxLength={120} disabled={Boolean(settingsSaving)} onChange={(event) => { setPlanetEditTagline(event.target.value); setPlanetEditError(''); setPlanetEditFeedback('') }} />
            </div>
            <AudiusCdPicker api={api} onTracks={mergeCatalogTracks} tracks={planetEditTracks} selectedIds={planetEditTrackIds} onToggle={togglePlanetEditTrack}
              query={planetEditQuery} onQuery={setPlanetEditQuery} searchId="music-settings-track-search"
              primaryId={planetEditPrimaryTrackId} onPrimary={id => { setPlanetEditPrimaryTrackId(id); setPlanetEditFeedback('') }}
              disabled={Boolean(settingsSaving)} reducedMotion={reducedMotion} player={musicPlayer} />
            {planetEditError && <p className="music-form-error" role="alert">{planetEditError}</p>}
            {planetEditFeedback && <p className="music-feedback" role="status">{planetEditFeedback}</p>}
            <DitherButton className="music-secondary-button" type="submit" disabled={Boolean(settingsSaving)}>{settingsSaving === 'planet-profile' ? '正在保存…' : '保存星球资料'}</DitherButton>
          </section>
        </form>}
        {view === 'settings' && settingsStatus === 'ready' && socialSettings && <div className="music-settings-content">
          <section className="music-settings-section" aria-label="Galaxy 曲风">
            <div className="music-section-heading"><DitherTitle level={3}>Galaxy 曲风</DitherTitle></div><p>默认 8 种。可选择 1–16 种候选，超过 8 种时每日随机展示其中 8 种，00:00（UTC+8）更新；自己的星球节点另算。空星系表示暂时没有公开星球。</p>
            <div className="music-genre-preferences"><Paginated items={AUDIUS_GENRES} label="可选曲风" pageSize={12}>{genre => <label key={genre}><input type="checkbox" checked={genreDraft.includes(genre)}
              disabled={Boolean(settingsSaving) || !genreDraft.includes(genre) && genreDraft.length >= 16}
              onChange={e => setGenreDraft(current => e.target.checked ? [...current, genre] : current.filter(g => g !== genre))} />{genre}</label>}</Paginated></div>
            <DitherButton disabled={Boolean(settingsSaving) || !genreDraft.length || JSON.stringify(genreDraft) === JSON.stringify(galaxyGenres)} onClick={() => { void saveGalaxyGenres() }}>保存 Galaxy 曲风</DitherButton>
          </section>
          <GalaxySelectionSettings key={`artist:${planet?.id ?? 'new'}`} api={api} kind="artist" selectedOptions={galaxyArtists} disabled={Boolean(settingsSaving)} onSave={ids => saveGalaxySelections('artist', ids)} />
          <GalaxySelectionSettings key={`song:${planet?.id ?? 'new'}`} api={api} kind="song" selectedOptions={galaxySongs} disabled={Boolean(settingsSaving)} onSave={ids => saveGalaxySelections('song', ids)} />
          <section className="music-settings-section" aria-label="访问与接收偏好">
            <div className="music-section-heading"><DitherTitle level={3}>访问与接收</DitherTitle><span>随时可更改</span></div>
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
          <FriendManagement key={accountEpoch.current} api={api} friends={social.snapshot?.friends} onChanged={handleFriendChange} onRefresh={social.refresh} />
          <section className="music-settings-section" aria-label="好友卫星管理">
            <div className="music-section-heading"><DitherTitle level={3}>好友卫星</DitherTitle><span>{home.status === 'ready' ? `展示 ${Math.min(5, home.friendSatellites.length)} 颗 · 共 ${home.friendSatellites.length} 位好友` : '读取中'}</span></div>
            <p className="music-panel-note">音乐卫星使用各自的歌曲封面，不重复行星外观已使用的那首歌。好友卫星最多 5 颗，最近聊过天的优先，其余随机补齐，每日更新；下方保留完整好友列表。</p>
            {friendSatelliteError && <div className="music-galaxy-empty" role="alert"><p>{friendSatelliteError}</p><DitherButton type="button" className="music-text-button" onClick={() => { void reloadFriendSatellites() }}>重新读取</DitherButton></div>}
            {friendSatelliteFeedback && <p className="music-feedback" role="status">{friendSatelliteFeedback}</p>}
            {home.status === 'ready' && home.friendSatellites.length > 0
              ? <div className="music-friend-satellites-list">{<Paginated items={home.friendSatellites} label="好友卫星">{(friend) => <article className="music-friend-satellite-row" key={friend.id}>
                  <span className="music-friend-satellite-icon" style={{ '--friend-color': friend.color } as CSSProperties} aria-hidden="true"><i /></span>
                  <span className="music-friend-satellite-copy"><strong>{friend.displayName}</strong><small>{friend.tagline || (friend.isVirtual ? '虚拟演示好友' : '已成为好友')}</small></span>
                  {friend.canRemove && <DitherButton className="music-text-button" type="button" aria-label={`移除好友卫星 ${friend.displayName}`} disabled={Boolean(friendSatelliteBusyId)} onClick={() => { void removeFriendSatellite(friend) }}>{friendSatelliteBusyId === friend.id ? '移除中…' : '移除'}</DitherButton>}
                </article>}</Paginated>}</div>
              : home.status === 'ready' ? <p className="music-moments-empty">轨道暂时空着。之后可以继续认识新的朋友。</p> : null}
          </section>
          <section className="music-settings-section" aria-label="Moment 公开范围">
            <div className="music-section-heading"><DitherTitle level={3}>Moment 公开范围</DitherTitle><span>{momentsLoading ? '读取中' : momentsLoadError ? '暂不可用' : `${moments.length} 条`}</span></div>
            {!planet ? <p className="music-moments-empty">创建星球并留下 Moment 后，可以逐条调整公开范围。</p>
              : momentsLoading ? <DitherLoadingRing label="正在读取 Moment" />
              : momentsLoadError ? <div className="music-galaxy-empty" role="alert"><p>暂时无法读取 Moment，当前显示的内容不代表没有记录。</p><DitherButton type="button" className="music-text-button" onClick={() => { void reloadMoments() }}>重试读取</DitherButton></div>
                : !moments.length ? <p className="music-moments-empty">还没有 Moment。写下之后，你可以在这里决定每条内容是否公开。</p>
                  : <div className="music-settings-moments">{<Paginated items={moments} label="我的 Moment" pageSize={3}>{(moment) => <label className="music-visibility-toggle music-settings-toggle music-settings-moment" key={moment.id}>
                    <input aria-label={`公开 Moment：${moment.track.title}`} type="checkbox" checked={moment.visibility === 'public'} disabled={Boolean(settingsSaving)} onChange={(event) => { void updateMomentVisibility(moment.id, event.target.checked ? 'public' : 'private') }} />
                    <span><strong>{moment.track.title} · {moment.track.artistName}</strong><small>{settingsSaving === `moment-${moment.id}` ? '正在保存…' : moment.visibility === 'public' ? '公开给访客' : '仅自己可见'}{moment.contentText ? ` · ${moment.contentText}` : ''}</small></span>
                  </label>}</Paginated>}</div>}
          </section>
        </div>}
        {view === 'settings' && moderatorAvailable && settingsStatus === 'ready' && <section className="music-settings-section" aria-label="内部内容审核">
          <div className="music-section-heading"><DitherTitle level={3}>内部内容审核</DitherTitle><span>仅授权账号</span></div>
          <p className="music-panel-note">处理举报并记录状态。审核列表不展示被举报内容。</p>
          <DitherButton className="music-secondary-button" type="button" onClick={() => changeView('moderation')}>打开审核队列</DitherButton>
        </section>}
        {view === 'settings' && <PairedDevices />}
        {view === 'settings' && <section className="music-settings-section" aria-label="匿名体验身份">
          <div className="music-section-heading"><DitherTitle level={3}>匿名体验身份</DitherTitle><span>自动创建</span></div>
          <p className="music-panel-note">账号已保存在这个浏览器中。换浏览器或清除本站点数据后，会生成新的随机账号；当前演示阶段暂不支持跨设备找回。</p>
        </section>}
      </aside>}

      {view === 'moderation' && moderatorAvailable && <aside className="music-panel music-moderation-panel" aria-label="举报审核">
        <div className="music-panel-head">
          <div><span className="music-kicker">Mosic · 内部工具</span><DitherTitle level={2}>举报审核</DitherTitle></div>
          <DitherButton className="music-text-button" type="button" onClick={() => changeView('settings')}>返回设置</DitherButton>
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
          <DitherButton className="music-secondary-button" type="button" disabled={moderationStatus === 'loading'} onClick={() => { void loadModerationQueue(moderationFilter) }}>刷新队列</DitherButton>
        </div>
        {moderationError && <p className="music-form-error" role="alert">{moderationError}</p>}
        {moderationStatus === 'loading' && <DitherLoadingRing label="正在读取审核队列…" />}
        {moderationStatus === 'error' && <DitherButton className="music-text-button" type="button" onClick={() => { void loadModerationQueue(moderationFilter) }}>重试读取</DitherButton>}
        {moderationStatus === 'ready' && !moderationReports.length && <p className="music-moments-empty">当前筛选下没有待审核记录。</p>}
        {moderationStatus === 'ready' && moderationReports.length > 0 && <div className="music-moderation-list" aria-label="举报记录">
          {<Paginated items={moderationReports} label="举报记录">{(report) => <article className="music-moderation-report" key={report.id}>
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
              {report.status === 'open' && <DitherButton className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`开始处理 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'reviewing') }}>开始处理</DitherButton>}
              <DitherButton className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`标记已处置 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'actioned') }}>标记已处置</DitherButton>
              <DitherButton className="music-text-button" type="button" disabled={Boolean(moderationBusyId)} aria-label={`驳回 ${report.id}`} onClick={() => { void reviewModerationReport(report.id, 'dismissed') }}>驳回</DitherButton>
              {moderationBusyId === report.id && <span role="status">正在保存…</span>}
            </div>}
          </article>}</Paginated>}
          {moderationHasMore && <DitherButton className="music-secondary-button music-moderation-more" type="button" disabled={Boolean(moderationBusyId)} onClick={() => { void loadModerationQueue(moderationFilter, moderationReports.length, true) }}>加载更多举报</DitherButton>}
        </div>}
      </aside>}

      {visitedPlanet && view === 'visitor' && <aside className="music-panel music-public-planet-panel" aria-label={`公开星球 ${visitedPlanet.displayName}`}>
        <div className="music-public-profile">
        <div className="music-public-profile-copy"><span className="music-kicker">公开星球 · 公开内容</span><DitherTitle level={2}>{visitedPlanet.displayName}</DitherTitle>
          {visitedPlanet.tagline && <p className="music-public-tagline">{visitedPlanet.tagline}</p>}
        </div>
        <div className="music-social-actions" aria-label="星主关系">
          <DitherButton className="music-secondary-button" type="button" disabled={Boolean(socialBusyId) || Boolean(visitedFriend) || Boolean(visitedOutgoing && !visitedIncoming)} onClick={() => { if (visitedIncoming) { social.dismiss(); changeView('orbit') } else void sendFriendRequest() }}>
            {visitedFriend ? '已经是好友' : visitedIncoming ? '回应好友请求' : socialBusyId === visitedPlanet.id ? '正在发送…' : visitedOutgoing?.status === 'pending' ? '好友请求已发送' : visitedOutgoing?.status === 'rejected' ? '对方暂未接受' : '发送好友请求'}
          </DitherButton>
          {visitedFriend && <DitherButton type="button" onClick={() => openConversation(visitedFriend.userId, visitedFriend.displayName)}>私信 {visitedFriend.displayName}</DitherButton>}
          <DitherButton className="music-text-button music-block-button" type="button" disabled={Boolean(blockingPlanetId)} onClick={() => { void blockVisitedPlanet() }}>
            {blockingPlanetId === visitedPlanet.id ? '正在屏蔽…' : '屏蔽此人'}
          </DitherButton>
        </div>
        </div>
        <ReportControl api={api} target={{ type: 'planet', id: visitedPlanet.id }} ariaLabel="举报这颗星球" />
        {visibleSocialFeedback && <p className="music-social-feedback" role="status">{visibleSocialFeedback}</p>}
        {socialError && <p className="music-form-error" role="alert">{socialError}</p>}
        {blockConfirm && <div role="group" aria-label="确认屏蔽星主"><p>屏蔽后将无法互相发现、访问或私信。</p><DitherButton onClick={() => { void blockVisitedPlanet() }}>确认屏蔽</DitherButton><DitherButton onClick={() => setBlockConfirm(false)}>取消屏蔽</DitherButton></div>}

        <section className="music-public-section" aria-label="对方公开选择的歌曲">
          <div className="music-section-heading"><DitherTitle level={3}>星球上的歌</DitherTitle><span>{visitedPlanet.tracks.length} 首</span></div>
          <CdPicker key={visitedPlanet.id} readOnly tracks={visitedPlanet.tracks} selectedIds={[]} onToggle={() => {}}
            query="" onQuery={() => {}} searchId={`visitor-cds-${visitedPlanet.id}`} reducedMotion={reducedMotion}
            primaryId={visitedPlanet.tracks.find(track => track.isPrimary)?.id} player={musicPlayer}
            canContinue={canOpenSongPortal} onContinue={track => { void openSongPortal(track, visitedPlanet.id) }} />
        </section>

        <section className="music-public-section music-moments" aria-label="对方公开的 Moments">
          <div className="music-section-heading"><DitherTitle level={3}>公开 Moment</DitherTitle><span>{visitedPlanet.moments.length}</span></div>
          {!visitedPlanet.moments.length
            ? <p className="music-moments-empty">这颗星球还没有公开 Moment。</p>
            : <Paginated items={visitedPlanet.moments} label="公开 Moment" pageSize={3}>{(moment) => <article className="music-moment-item" key={moment.id}>
                <div className="music-moment-meta"><span>{new Date(moment.publishedAt ?? moment.createdAt).toLocaleDateString('zh-CN')}</span></div>
                <MomentContent player={musicPlayer} track={moment.track} contentText={moment.contentText} photoUrl={moment.photoUrl} />
                <ReportControl api={api} target={{ type: 'moment', id: moment.id }} ariaLabel="举报这条 Moment" />
              </article>}</Paginated>}
        </section>
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
        {songPortal.status === 'ready' && <DitherButton className="music-secondary-button" type="button" onClick={() => changeView('collision')}>返回同歌结果</DitherButton>}
      </aside>}

      {panelPlanet && (view === 'planet' || view === 'collision' || view === 'moment') && <aside className="music-panel music-planet-panel" aria-label={view === 'collision' ? '同歌搜索' : view === 'moment' ? 'Moment 编辑' : '我的音乐星球'}>
        {view !== 'moment' && <>
        <div className="music-panel-head"><div><span className="music-kicker">星球轨道 · {panelPlanet.visibility === 'public' ? '公开访问' : '仅自己'}</span><DitherTitle level={2}>留在这里的歌</DitherTitle></div><span className="music-count">{panelPlanet.tracks.length}<i>首</i></span></div>
        {view === 'collision' ? <CdPicker key={panelPlanet.id} readOnly tracks={panelPlanet.tracks}
          selectedIds={songPortal.status === 'idle' ? [] : [songPortal.track.id]} onToggle={() => {}}
          query="" onQuery={() => {}} searchId="collision-cds" reducedMotion={reducedMotion}
          primaryId={panelPlanet.tracks.find(track => track.isPrimary)?.id} player={musicPlayer}
          canContinue={canOpenSongPortal} continueLabel="撞歌 ↗" onContinue={track => { void openSongPortal(track, cockpit.exterior === 'visitor' ? visitedPlanet?.id : undefined) }} />
        : <div className="music-owned-track-list">
          {panelPlanet.tracks.map((track) => <article className="music-owned-track" key={track.id}>
            <DitherTrackMark track={track} />
            <div className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.isPrimary ? ' · 星球主旋律' : ''}{isDemoTrack(track) ? ' · 演示曲目（不可播放）' : ''}</small></div>
            {track.audioUrl ? <DitherButton data-music-toggle type="button" onClick={() => musicPlayer.toggle(track)} aria-label={`${musicPlayer.playing && musicPlayer.currentTrackId === track.id ? '暂停' : '播放'} ${track.title}`}>{musicPlayer.playing && musicPlayer.currentTrackId === track.id ? 'Ⅱ' : '▶'}</DitherButton>
              : <span className="music-link-unavailable" title="暂无可用音源">—</span>}
            <DitherButton className="music-track-portal-button" type="button" aria-label={`寻找与《${track.title}》同歌的星球`} onClick={() => { void openSongPortal(track) }}>撞歌 ↗</DitherButton>
          </article>)}
        </div>}

        </>}
        {view === 'collision' && songPortal.status === 'idle' && <p className="music-moments-empty">选择一首歌，寻找同歌星球。</p>}
        {view === 'collision' && songPortal.status !== 'idle' && <section ref={songPortalResults} className="music-song-portal" aria-label="同歌星球">
          <div className="music-section-heading">
            <DitherTitle level={3}>与《{songPortal.track.title}》同歌</DitherTitle>
            <DitherButton type="button" className="music-close-inline" aria-label="关闭同歌结果" onClick={() => { songRequestId.current++; setSongPortal({ status: 'idle' }) }}>×</DitherButton>
          </div>
          {songPortal.status === 'loading' && <DitherLoadingRing label="正在寻找同歌星球" />}
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
                  <Paginated items={songPortal.response.matches} label="撞歌星球" pageSize={6}>{match => <PlanetCard key={match.planetId} planet={match}
                    reason={matchDescription(match)} busy={visitingPlanetId === match.planetId} disabled={Boolean(visitingPlanetId)}
                    onVisit={() => requestPublicPlanetVisit(match.planetId, match.displayName, 'song_portal', songPortal.track.id, songPortal.sourcePlanetId)} />}</Paginated>
                </div>}
            {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
          </>}
        </section>}

        {view === 'moment' && <form ref={momentComposer} className="music-moment-form" onSubmit={addMoment}>
          <div className="music-section-heading"><DitherTitle level={3}>留下一个 Moment</DitherTitle><span>最多 500 字</span></div>
          <label htmlFor="music-moment-track">这段 Moment 属于哪首歌</label>
          <select id="music-moment-track" value={momentTrackId} onChange={(event) => setMomentTrackId(event.target.value)}>
            {panelPlanet.tracks.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.artistName}</option>)}
          </select>
          <textarea value={momentText} onChange={(event) => setMomentText(event.target.value)} maxLength={500} placeholder="这首歌让你想起了什么？" aria-label="Moment 内容" />
          <MomentPhotoPicker file={momentPhoto} error={momentPhotoFeedback} busy={savingMoment} onChange={(file,error) => { setMomentPhoto(file); setMomentPhotoFeedback(error); setMomentFeedback('') }} />
          <div className="music-moment-actions">
            <div className="music-moment-visibility" role="radiogroup" aria-label="Moment 可见范围">
              <label className="music-moment-privacy"><input type="radio" name="moment-visibility" value="public" checked={!momentPrivate} disabled={savingMoment} onChange={() => { setMomentPrivate(false); setMomentFeedback('') }} /><span>公开给访客</span></label>
              <label className="music-moment-privacy"><input type="radio" name="moment-visibility" value="private" checked={momentPrivate} disabled={savingMoment} onChange={() => { setMomentPrivate(true); setMomentFeedback('') }} /><span>仅自己可见</span></label>
            </div>
            <span>{momentText.length}/500</span>
          </div>
          {momentFeedback && <p className="music-feedback" aria-live="polite">{momentFeedback}</p>}
          <DitherButton className="music-secondary-button" type="submit" disabled={savingMoment || !momentTrackId || Boolean(momentPhotoFeedback)}>{savingMoment ? '正在保存…' : momentPrivate ? '保存私密 Moment' : '公开发布 Moment'} <span aria-hidden="true">↗</span></DitherButton>
        </form>}

        {view !== 'collision' && <section className="music-moments" aria-label="我的 Moments">
          <div className="music-section-heading"><div className="music-moments-heading-title"><DitherTitle level={3}>沿途留下的 Moment</DitherTitle><DitherButton className="music-moment-add" type="button" aria-label="发布 Moment" title="发布 Moment" onClick={() => { changeView('moment'); setMomentComposeRequested(true) }}>＋</DitherButton></div><span>{momentsLoading ? '读取中' : moments.length}</span></div>
          {momentsLoading ? <DitherLoadingRing label="正在读取 Moment" /> : !moments.length ? <p className="music-moments-empty">还没有 Moment。留下一段片刻吧。</p> : <Paginated items={moments} label="我的 Moment" pageSize={3}>{(moment) => <article className="music-moment-item" key={moment.id}>
            <div className="music-moment-meta"><span>{moment.visibility === 'public' ? '公开' : '仅自己'} · {new Date(moment.createdAt).toLocaleDateString('zh-CN')}</span></div>
            <MomentContent player={musicPlayer} track={moment.track} contentText={moment.contentText} photoUrl={moment.photoUrl} />
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
                    <DitherButton className="music-secondary-button" type="submit" disabled={momentManagement.busy}>
                      {momentManagement.busy ? '正在保存…' : '保存 Moment 修改'}
                    </DitherButton>
                    <DitherButton className="music-text-button" type="button" disabled={momentManagement.busy} onClick={() => setMomentManagement({ status: 'idle' })}>取消编辑</DitherButton>
                  </div>
                  {momentManagement.error && <p className="music-form-error" role="alert">{momentManagement.error}</p>}
                </form>
              : momentManagement.status === 'confirm-delete' && momentManagement.momentId === moment.id
                ? <div className="music-moment-delete-confirm" role="group" aria-label="确认删除 Moment">
                    <p>删除后，这条 Moment 会从访客页面和发现入口移除。</p>
                    {momentManagement.error && <p className="music-form-error" role="alert">{momentManagement.error}</p>}
                    <div className="music-moment-owner-actions">
                      <DitherButton className="music-text-button is-danger" type="button" disabled={momentManagement.busy} onClick={() => { void deleteMoment() }}>
                        {momentManagement.busy ? '正在删除…' : `确认删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`}
                      </DitherButton>
                      <DitherButton className="music-text-button" type="button" disabled={momentManagement.busy} onClick={() => setMomentManagement({ status: 'idle' })}>
                        {`取消删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`}
                      </DitherButton>
                    </div>
                  </div>
                : <div className="music-moment-owner-actions">
                    <DitherButton className="music-text-button" type="button" disabled={momentManagement.status !== 'idle'} aria-label={`编辑 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`} onClick={() => beginMomentEdit(moment)}>编辑</DitherButton>
                    <DitherButton className="music-text-button is-danger" type="button" disabled={momentManagement.status !== 'idle'} aria-label={`删除 Moment：${moment.contentText.slice(0, 40) || moment.track.title}`} onClick={() => setMomentManagement({ status: 'confirm-delete', momentId: moment.id, busy: false, error: '' })}>删除</DitherButton>
                  </div>}
          </article>}</Paginated>}
        </section>}
      </aside>}
      {!panelPlanet && (view === 'moment' || view === 'collision') && <div className="music-panel"><DitherTitle level={2}>{view === 'moment' ? 'Moment' : '撞歌'}</DitherTitle><p>先创建自己的音乐星球。</p><DitherButton onClick={() => changeView('planet')}>创建星球</DitherButton></div>}

      {view === 'galaxy' && <aside className="music-panel music-galaxy-panel" aria-label="Galaxy 公开星球发现">
        <div className="music-panel-head"><div><span className="music-kicker">公开星球 · 可直接访问</span><DitherTitle level={2}>Galaxy</DitherTitle></div></div>
        <p className="music-panel-note">按曲目、艺人或曲风浏览。超出显示上限时每日随机抽选，00:00（UTC+8）更新。艺人／曲风相近不代表听过同一首歌。</p>
        <div className="music-galaxy-dimensions" role="group" aria-label="Galaxy 分组方式">
          {([{ id: 'song', label: '歌曲' }, { id: 'artist', label: '艺人' }, { id: 'genre', label: '曲风' }] as const).map((option) => <DitherButton
            type="button"
            key={option.id}
            aria-pressed={galaxy.status !== 'idle' && galaxy.by === option.id}
            disabled={galaxy.status === 'loading'}
            onClick={() => { void regroupGalaxy(option.id) }}
          >{option.label}</DitherButton>)}
        </div>
        {galaxy.status === 'loading' && <DitherLoadingRing label="正在整理公开星球…" />}
        {galaxy.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>Galaxy 暂时没有响应。</p><DitherButton type="button" className="music-text-button" onClick={() => { void loadGalaxy(galaxy.by) }}>重试</DitherButton></div>}
        {galaxy.status === 'ready' && <>
          {!galaxy.response.groups.length
            ? <p className="music-moments-empty">现在还没有可展示的公开星球。</p>
            : <div className="music-galaxy-groups" role="group" aria-label="发现分组">
                {<Paginated items={galaxy.response.groups} label="星系分类">{(group) => <DitherButton
                  type="button"
                  className={`music-galaxy-group${galaxy.selectedGroupKey === group.key ? ' is-selected' : ''}`}
                  key={group.key}
                  aria-pressed={galaxy.selectedGroupKey === group.key}
                  onClick={() => focusGalaxyGroup(group.key)}
                >{group.label} <span>· {group.planetCount} 颗星球</span></DitherButton>}</Paginated>}
              </div>}
          {galaxy.response.groups.find((group) => group.key === galaxy.selectedGroupKey) && (() => {
            const group = galaxy.response.groups.find((item) => item.key === galaxy.selectedGroupKey)!
            return <section className="music-public-section" aria-label="星系内容">
              <div className="music-section-heading"><DitherTitle level={3}>{group.label}</DitherTitle><span>{group.planetCount} 颗</span></div>
              {!group.planets.length && <p className="music-panel-note">这个星系暂时没有可访问的公开星球。点击舷窗中的恒星可浏览该分类的音乐。</p>}
              <div className="music-discovery-list">
                <Paginated items={group.planets} label="星系星球" pageSize={6}>{candidate => <PlanetCard key={candidate.planetId} planet={candidate}
                  reason={galaxyReason(candidate.reasonCode)} busy={visitingPlanetId === candidate.planetId} disabled={Boolean(visitingPlanetId)}
                  onVisit={() => requestPublicPlanetVisit(candidate.planetId, candidate.displayName, 'galaxy')} />}</Paginated>
              </div>
            </section>
          })()}
        </>}
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
      </aside>}

      {view === 'roam' && <aside className="music-panel music-discovery-panel" aria-label="随机漫游">
        <div className="music-panel-head"><div><span className="music-kicker">相关性与随机性 · 今日航线</span><DitherTitle level={2}>随机漫游</DitherTitle></div></div>
        <p className="music-panel-note">每天最多 24 颗，00:00（UTC+8）重新抽选，同一天保持今日航线。只探索公开可访问的星球；打开卡片才会访问，推荐不会留下足迹。</p>
        {discovery.status === 'loading' && <DitherLoadingRing label="正在寻找下一站…" />}
        {discovery.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>暂时无法整理漫游路线。</p><DitherButton type="button" className="music-text-button" onClick={() => { void loadDiscovery() }}>重试</DitherButton></div>}
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
                <Paginated items={discovery.response.recommendations} label="漫游星球" pageSize={6}>{candidate => <PlanetCard key={candidate.planetId} planet={candidate}
                  reason={discoveryReason(candidate.reasonCode)} busy={visitingPlanetId === candidate.planetId} disabled={Boolean(visitingPlanetId)}
                  onVisit={() => requestPublicPlanetVisit(candidate.planetId, candidate.displayName, 'random_roam')} />}</Paginated>
              </div>}
          <DitherButton className="music-text-button music-reroll-button" type="button" onClick={() => { void loadDiscovery() }}>刷新今日漫游 ↗</DitherButton>
        </>}
      </aside>}

      {bottlesMounted && <div hidden={view !== 'bottles'}><DriftBottlePanel
        api={api}
        key={bottleAccountEpoch}
        copilotDraft={bottleDraft}
        active={view === 'bottles' && cockpit.console.focus !== 'overview'}
        onSettingsChange={settings => {
          if (bottleAccountEpoch === accountEpoch.current) setSocialSettings(settings)
        }}
        ReportControl={ReportControl}
        player={musicPlayer}
        tracks={planetEditTracks}
        moments={planet?.visibility === 'public' ? moments : []}
        onVisitPlanet={(planetId, name) => requestPublicPlanetVisit(planetId, name, 'direct')}
      /></div>}

      {view === 'orbit' && <aside className="music-panel music-orbit-panel" aria-label="My Orbit">
        <div className="music-panel-head"><div><span className="music-kicker">你的私人星图 · 仅自己可见</span><DitherTitle level={2}>My Orbit</DitherTitle></div></div>
        <p className="music-panel-note">足迹会随星球当前的公开状态变化；隐身访问只留在你的历史里。</p>
        <p className="music-panel-note" aria-live="polite">{social.connection === 'offline' ? '网络已断开，恢复连接后会自动同步好友动态。' : social.connection === 'reconnecting' ? '好友动态正在自动重连，暂时保留上次确认的状态。' : social.snapshot ? '好友动态自动同步中。' : '正在同步好友动态…'}</p>
        {orbit.status === 'loading' && <DitherLoadingRing label="正在整理你的星图…" />}
        {orbit.status === 'error' && <div className="music-galaxy-empty" role="alert"><p>暂时无法读取 My Orbit。</p><DitherButton type="button" className="music-text-button" onClick={() => { void loadOrbit() }}>重试</DitherButton></div>}
        {visibleSocialFeedback && view === 'orbit' && <p className="music-social-feedback" role="status">{visibleSocialFeedback}</p>}
        {socialError && view === 'orbit' && <p className="music-form-error" role="alert">{socialError}</p>}
        {(social.snapshot || orbit.status === 'ready') && <section className="music-orbit-group" aria-label="好友">
          <div className="music-section-heading"><DitherTitle level={3}>好友</DitherTitle><span>{orbitFriends.length}</span></div>
          {!orbitFriends.length ? <p className="music-moments-empty">成为好友后，会长期留在这里。</p> : <OrbitGrid items={orbitFriends} label="好友列表">{(entry) => <PlanetCard key={entry.userId} planet={entry}
            disabled={Boolean(visitingPlanetId)} busy={visitingPlanetId === entry.planetId}
            onVisit={entry.canVisit && entry.planetId ? () => requestPublicPlanetVisit(entry.planetId!, entry.displayName, 'orbit') : undefined}
            reason={!entry.canVisit ? '星球当前不可公开访问' : undefined}
            actions={<>
              <DitherButton type="button" className="music-secondary-button" aria-label={`私信 ${entry.displayName}${entry.unreadCount > 0 ? `，未读 ${entry.unreadCount} 条` : ''}`} onClick={() => { void openConversation(entry.userId, entry.displayName) }}>私信{entry.unreadCount > 0 ? ` · ${entry.unreadCount}` : ''}</DitherButton>
              {entry.canVisit && entry.planetId && <DitherButton type="button" className="music-secondary-button" disabled={Boolean(visitingPlanetId)} onClick={() => requestPublicPlanetVisit(entry.planetId!, entry.displayName, 'orbit')}>访问星球</DitherButton>}
            </>} />}</OrbitGrid>}
        </section>}
        {friendRequests && view === 'orbit' && <section className="music-orbit-group music-friend-requests" aria-label="好友请求">
          <div className="music-section-heading"><DitherTitle level={3}>好友请求</DitherTitle><span>{friendRequests.incoming.length} 待处理</span></div>
          <h4>收到的好友请求</h4>
          {!friendRequests.incoming.length ? <p className="music-moments-empty">还没有新的请求。</p> : <OrbitGrid items={friendRequests.incoming} label="收到的好友请求">{(request) => <PlanetCard key={request.id} planet={request}
            disabled={Boolean(visitingPlanetId)}
            onVisit={request.planetId ? () => requestPublicPlanetVisit(request.planetId!, request.displayName, 'orbit') : undefined}
            actions={<>
              <DitherButton type="button" className="music-secondary-button" aria-label={`接受 ${request.displayName}`} disabled={socialBusyId === request.id} onClick={() => { void respondToFriendRequest(request.id, 'accept') }}>接受</DitherButton>
              <DitherButton type="button" className="music-text-button" disabled={socialBusyId === request.id} onClick={() => { void respondToFriendRequest(request.id, 'reject') }}>拒绝</DitherButton>
            </>} />}</OrbitGrid>}
          <h4>已发送</h4>
          {!friendRequests.outgoing.length ? <p className="music-moments-empty">你发送的好友请求会显示在这里。</p> : <OrbitGrid items={friendRequests.outgoing} label="发送的好友请求">{(request) => <PlanetCard key={request.id} planet={request}
            disabled={Boolean(visitingPlanetId)}
            onVisit={request.planetId ? () => requestPublicPlanetVisit(request.planetId!, request.displayName, 'orbit') : undefined}
            reason={request.status === 'rejected' ? '对方暂未接受' : '等待对方回应'} actions={null} />}</OrbitGrid>}
        </section>}

        {orbit.status === 'ready' && <div className="music-orbit-groups">
          <section className="music-orbit-group" aria-label="我访问过">
            <div className="music-section-heading"><DitherTitle level={3}>我访问过</DitherTitle><span>{orbit.response.groups.visitedByMe.length}</span></div>
            {!orbit.response.groups.visitedByMe.length ? <p className="music-moments-empty">你访问过的公开星球会出现在这里。</p> : <OrbitGrid items={orbit.response.groups.visitedByMe} label="我的访问">{(entry) => <PlanetCard key={entry.planetId} planet={entry}
              reason={entry.isIncognito ? '隐身访问 · 仅你可见' : undefined}
              visitLabel="再次访问" busy={visitingPlanetId === entry.planetId} disabled={Boolean(visitingPlanetId)}
              onVisit={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'orbit')} />}</OrbitGrid>}
          </section>
          <section className="music-orbit-group" aria-label="访问过我">
            <div className="music-section-heading"><DitherTitle level={3}>访问过我</DitherTitle><span>{orbit.response.groups.visitorsToMe.length}</span></div>
            {!orbit.response.groups.visitorsToMe.length ? <p className="music-moments-empty">非隐身访客的公开星球会显示在这里。</p> : <OrbitGrid items={orbit.response.groups.visitorsToMe} label="来访星球">{(entry) => <PlanetCard key={`${entry.userId}-${entry.planetId}`} planet={entry}
              visitLabel="回访星球" busy={visitingPlanetId === entry.planetId} disabled={Boolean(visitingPlanetId)}
              onVisit={() => requestPublicPlanetVisit(entry.planetId, entry.displayName, 'orbit')} />}</OrbitGrid>}
          </section>
        </div>}
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
      </aside>}
    </div>

    {pendingVisit && view === 'preflight' && <div className="cockpit-preflight">
      <section
        className="music-visit-dialog"
        role="region"
        aria-labelledby="music-visit-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !visitingPlanetId) {
            event.stopPropagation()
            setPendingVisit(null); dispatchCockpit({ type: 'back' })
            setVisitError('')
          }
        }}
      >
        <span className="music-kicker">公开星球 · 访问前确认</span>
        <DitherTitle level={2} id="music-visit-title">要访问「{pendingVisit.displayName}」吗？</DitherTitle>
        <p>默认会在对方的 Orbit 留下最近访问足迹。你也可以选择隐身；隐身足迹只保留在自己的访问历史中。</p>
        <label className="music-visit-incognito"><input type="checkbox" checked={incognitoVisit} onChange={(event) => setIncognitoVisit(event.target.checked)} /><span><strong>隐身访问</strong><small>对方不会在“访问过我”中看到你</small></span></label>
        {visitError && <p className="music-form-error" role="alert">{visitError}</p>}
        <div className="music-visit-actions">
          <DitherButton className="music-secondary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => { setPendingVisit(null); setVisitError(''); dispatchCockpit({ type: 'back' }) }}>暂不访问</DitherButton>
          <DitherButton className="music-primary-button" type="button" disabled={Boolean(visitingPlanetId)} onClick={() => { void visitPublicPlanet() }}>{visitingPlanetId ? '正在接近…' : '继续访问'} <span aria-hidden="true">↗</span></DitherButton>
        </div>
      </section>
    </div>}
    </CockpitShell>
    {conversation && <Communicator key={`${accountEpoch.current}:${conversation.userId}`} api={api} peer={conversation} tracks={tracks} player={musicPlayer} onClose={() => { setConversation(null); void social.refresh() }} renderReport={id => <ReportControl api={api} target={{ type: 'direct_message', id }} ariaLabel="举报这条私信" />} />}
    {galaxyWindowOpen && galaxy.status === 'ready' && selectedGalaxyGroup && <GalaxyWindow key={`${galaxy.by}:${selectedGalaxyGroup.key}`} api={api} by={galaxy.by} group={selectedGalaxyGroup} player={musicPlayer} crtEnabled={crtEnabled} reducedMotion={reducedMotion} onClose={() => setGalaxyWindowOpen(false)} />}
    </div>
    {!homeReady && !firstRunOpen && <aside className="music-startup-signal" role={home.status === 'error' ? 'alert' : 'status'}>
      {home.status === 'loading' ? <span>正在接通个人信号…</span> : <><span>暂时连接不上，星际档案仍在原处。没有任何资料被覆盖。</span><DitherButton type="button" onClick={() => { void reloadHome() }}>重新连接</DitherButton></>}
    </aside>}
    {firstRunOpen && <FirstRun key={accountEpoch.current} api={api} tracks={tracks} player={musicPlayer} planet={planet}
      reducedMotion={reducedMotion} crtEnabled={crtEnabled} status={home.status}
      onTracks={mergeCatalogTracks} onRetry={() => { void reloadHome() }}
      onSavePreferences={saveFirstRunPreferences} onCreatePlanet={createFirstRunPlanet}
      onFinishRequested={rememberFirstRunFinished} onFinish={finishFirstRun} />}
  </main>
}

export default MusicApp
