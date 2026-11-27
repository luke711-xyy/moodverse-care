import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { MusicApi, MusicPlanet, MusicPlanetDraft } from '../../music-api'
import type { MusicTrackSummary } from '../../music-domain'
import { MAX_GALAXY_SELECTIONS, type GalaxyOptionsPage, type GalaxyPreferences, type GalaxyPreferencesPatch, type GalaxySelectionKind, type GalaxySelectionOption } from '../galaxy-preferences'
import type { MusicPlayerControls } from '../useMusicPlayer'
import { AudiusCdPicker } from '../AudiusCdPicker'
import { CdFace } from '../CdPicker'
import { CrtScreen } from '../cockpit/CrtScreen'
import { DitherSurfaceDefinitions } from '../cockpit/surface'
import { createDitherSpec, resolveDitherSpec } from '../dither/appearance'
import { DitherThumbnail } from '../dither/DitherCanvas'
import './first-run.css'

export type FirstRunProps = {
  api: MusicApi
  tracks: MusicTrackSummary[]
  player: MusicPlayerControls
  reducedMotion: boolean
  crtEnabled: boolean
  status: 'loading' | 'ready' | 'error'
  planet: MusicPlanet | null
  onTracks: (tracks: MusicTrackSummary[]) => void
  onRetry: () => void
  onSavePreferences: (patch: GalaxyPreferencesPatch) => Promise<GalaxyPreferences>
  onCreatePlanet: (draft: MusicPlanetDraft) => Promise<MusicPlanet>
  onFinishRequested?: () => void
  onFinish: (destination?: 'galaxy' | 'planet' | 'collision' | 'moment' | 'orbit') => void
}

type Page = 'welcome' | 'preferences' | 'songs' | 'profile' | 'formed' | 'tour'
type PreferenceChannel = 'genre' | GalaxySelectionKind
type PreferenceDraft = { genres: string[]; artists: GalaxySelectionOption[]; songs: GalaxySelectionOption[] }
const preferenceChannels: Array<{ id: PreferenceChannel; label: string }> = [{ id: 'genre', label: '曲风' }, { id: 'artist', label: '艺人' }, { id: 'song', label: '歌曲' }]
const previewSeed = 'mosic-first-frequency'
const validTrack = (track: MusicTrackSummary) => Boolean(track.id && track.title && track.artistName && Array.isArray(track.genres) && Array.isArray(track.moodTags))
const readDraft = (preferences: GalaxyPreferences): PreferenceDraft => ({ genres: [...preferences.genres], artists: [...preferences.artists], songs: [...preferences.songs] })

/** Only reads candidate options. Selections remain in the parent between channels. */
function PreferenceOptions({ api, kind, selected, disabled, onChange }: {
  api: MusicApi; kind: GalaxySelectionKind; selected: GalaxySelectionOption[]; disabled: boolean; onChange: (options: GalaxySelectionOption[]) => void
}) {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; page: GalaxyOptionsPage } | null>(null), [failed, setFailed] = useState(false)
  const key = JSON.stringify([kind, query, offset]), label = kind === 'artist' ? '艺人' : '歌曲'
  const data = result?.key === key ? result.page : null
  const pages = useRef([0])
  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    const timer = window.setTimeout(() => {
      void api.searchGalaxyOptions(kind, query, offset, controller.signal).then(page => {
        if (!controller.signal.aborted) setResult({ key, page })
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [api, kind, query, offset, retry])
  const toggle = (option: GalaxySelectionOption) => {
    if (disabled) return
    if (selected.some(item => item.id === option.id)) onChange(selected.filter(item => item.id !== option.id))
    else if (selected.length < MAX_GALAXY_SELECTIONS) onChange([...selected, option])
  }
  return <div className="first-run-options">
    <label className="first-run-field">搜索{label}<input type="search" aria-label={`搜索偏好${label}`} value={query} maxLength={120} disabled={disabled}
      placeholder={kind === 'artist' ? '输入艺人名字' : '输入歌名或艺人'} onChange={event => { setQuery(event.target.value); pages.current = [0]; setOffset(0) }} /></label>
    {selected.length > 0 && <div className="first-run-selected" aria-label={`已选偏好${label}`}>{selected.map(option => <button key={option.id} type="button" disabled={disabled}
      aria-label={`移除偏好${label} ${option.label}`} onClick={() => toggle(option)}>{option.label} <span aria-hidden="true">×</span></button>)}</div>}
    {failed ? <div className="first-run-feedback" role="alert">候选暂时没收到，已保留你的选择。<button type="button" onClick={() => setRetry(n => n + 1)}>重试候选</button></div>
      : !data ? <div className="first-run-option-skeleton" role="status">正在接收{label}…</div>
        : data.options.length ? <div className="first-run-checklist">{data.options.map(option => {
          const checked = selected.some(item => item.id === option.id)
          return <label key={option.id}><input type="checkbox" aria-label={`偏好${label} ${option.label}`} checked={checked}
            disabled={disabled || !checked && selected.length >= MAX_GALAXY_SELECTIONS} onChange={() => toggle(option)} /><span>{option.label}</span></label>
        })}</div> : <p className="first-run-note">没有找到匹配的{label}，换个关键词试试。</p>}
    <nav className="first-run-pagination" aria-label={`偏好${label}分页`}>
      <button type="button" disabled={disabled || !data || pages.current.length < 2} onClick={() => { pages.current.pop(); setOffset(pages.current[pages.current.length - 1]) }}>上一页</button>
      <span>第 {pages.current.length} 页</span>
      <button type="button" disabled={disabled || !data?.hasMore || data.nextOffset == null || data.nextOffset <= offset}
        onClick={() => { if (data?.nextOffset != null && data.nextOffset > offset) { pages.current.push(data.nextOffset); setOffset(data.nextOffset) } }}>下一页</button>
    </nav>
  </div>
}

function PlanetSignal({ planet, tracks, compact = false, awaitingSong = false }: { planet: MusicPlanet | null; tracks: MusicTrackSummary[]; compact?: boolean; awaitingSong?: boolean }) {
  const spec = useMemo(() => {
    const safeTracks = tracks.filter(validTrack)
    try { return planet ? resolveDitherSpec(planet.id, planet.tracks.filter(validTrack), planet.visual) : createDitherSpec({ planetId: previewSeed, tracks: safeTracks }) }
    catch { return createDitherSpec({ planetId: planet?.id ?? previewSeed, tracks: [] }) }
  }, [planet, tracks])
  const selected = (planet?.tracks ?? tracks).slice(0, 3)
  return <figure className={`first-run-planet${compact ? ' is-compact' : ''}`} aria-label={planet ? `${planet.displayName}的星球信号` : '星球生长预览'} data-song-count={selected.length}>
    <span className="first-run-orbit-ring" aria-hidden="true" />
    <div className="first-run-planet-core" style={{ '--planet-growth': planet ? 1 : .3 + selected.length * .23 } as CSSProperties}>
      {awaitingSong && !selected.length ? <span className="first-run-planet-seed" aria-hidden="true" /> : <DitherThumbnail spec={spec} size={256} label={planet ? `${planet.displayName}的已保存外观` : '随选歌生长的像素星球'} />}
    </div>
    {selected.map((track, index) => <span key={track.id} className={`first-run-satellite first-run-satellite-${index}`} aria-hidden="true"><CdFace track={track} /></span>)}
    <figcaption>{planet ? '星球信号已确认' : selected.length ? `${selected.length} 首歌，正在长成你的样子` : '先放进一首歌'}</figcaption>
  </figure>
}

/** Entirely local teaching feedback: no match/visit request or cockpit navigation. */
function CollisionTutorial({ planet, tracks, onFinish }: Pick<FirstRunProps, 'planet' | 'tracks' | 'onFinish'>) {
  const [step, setStep] = useState<'song' | 'results' | 'planet'>('song')
  const title = useRef<HTMLHeadingElement>(null), feedback = useRef<HTMLHeadingElement>(null)
  const track = planet?.tracks[0] ?? tracks[0]
  const demoTracks = track ? [track, ...tracks.filter(item => item.id !== track.id).slice(0, 2)] : []
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (step !== 'song') feedback.current?.focus({ preventScroll: true }) }, [step])
  return <>
    <div className="first-run-title"><span>撞歌教学 · {step === 'song' ? '1 / 3' : step === 'results' ? '2 / 3' : '3 / 3'}</span><h1 ref={title} tabIndex={-1}>喜欢同一首歌的人，还会听什么</h1>{step === 'song' && <p>在自己的星球里，找到一首歌，点它旁边的「撞歌 ↗」。</p>}</div>
    <div className="first-run-tutorial">
      <p className="first-run-demo-label">教学模拟 · 不会发起真实匹配，也不会离开引导</p>
      {step === 'song' && <div className="first-run-song-demo">{track && <><span className="first-run-demo-cd"><CdFace track={track} /></span><div><strong>{track.title}</strong><p>{track.artistName}</p></div></>}
        <button type="button" className="first-run-primary" onClick={() => setStep('results')}>撞歌 ↗</button></div>}
      {step === 'results' && <section className="first-run-demo-result" aria-label="模拟撞歌结果">
        <PlanetSignal planet={null} tracks={demoTracks} compact />
        <div><h2 ref={feedback} tabIndex={-1}>发现一颗也收藏了这首歌的星球</h2><strong>晚风电台 <small>示例星球</small></strong><p>对方也选了《{track?.title ?? '这首歌'}》。点开星球，就能看看对方还在听什么。</p><button type="button" onClick={() => setStep('planet')}>看看示例星球</button></div>
      </section>}
      {step === 'planet' && <section className="first-run-demo-visit" aria-label="示例星球预览">
        <h2 ref={feedback} tabIndex={-1}>你来到「晚风电台」的 CD 架</h2>
        <div className="first-run-demo-collection">{demoTracks.map((item, index) => <div key={item.id}><span className="first-run-demo-cd"><CdFace track={item} /></span><strong>{item.title}</strong><span>{index === 0 ? '你们共同选中的歌' : item.artistName}</span></div>)}</div>
        <p role="status">这就是撞歌：从一首共同喜欢的歌，听见另一个人的音乐世界。这里的星球和结果仅作演示，不会留下访问记录。</p>
      </section>}
    </div>
    <div className="first-run-actions first-run-lesson-actions"><button type="button" className="first-run-primary" disabled={step !== 'planet'} onClick={() => onFinish()}>完成教学，进入驾驶舱</button></div>
  </>
}

export function FirstRun(props: FirstRunProps) {
  const [booting, setBooting] = useState(() => !props.reducedMotion && !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)), [page, setPage] = useState<Page>('welcome')
  const [closing, setClosing] = useState<'full' | 'reduced' | null>(null)
  const [channel, setChannel] = useState<PreferenceChannel>('genre'), [preferences, setPreferences] = useState<GalaxyPreferences | null>(null)
  const [draft, setDraft] = useState<PreferenceDraft>({ genres: [], artists: [], songs: [] }), [readStatus, setReadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [readRetry, setReadRetry] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [query, setQuery] = useState(''), [displayName, setDisplayName] = useState(''), [tagline, setTagline] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public'), [created, setCreated] = useState<MusicPlanet | null>(null)
  const [catalog, setCatalog] = useState<MusicTrackSummary[]>(props.tracks)
  const alive = useRef(true), locked = useRef(false), initialized = useRef(false), heading = useRef<HTMLHeadingElement>(null), scroll = useRef<HTMLDivElement>(null)
  const closingStarted = useRef(false), finishCallback = useRef(props.onFinish)
  finishCallback.current = props.onFinish
  const id = useId(), owned = created ?? props.planet
  const allTracks = useMemo(() => [...new Map([...props.tracks, ...catalog].map(track => [track.id, track])).values()], [props.tracks, catalog])
  const selectedTracks = useMemo(() => selectedIds.map(id => allTracks.find(track => track.id === id)).filter((track): track is MusicTrackSummary => Boolean(track && validTrack(track))), [selectedIds, allTracks])
  const seedTracks = allTracks.filter(track => validTrack(track) && draft.songs.some(song => song.id === track.id)).slice(0, 3)
  const creationReady = selectedIds.length === 3 && selectedTracks.length === 3 && new Set(selectedIds).size === 3
  const genresValid = draft.genres.length >= 1 && draft.genres.length <= 16
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!closing) return
    // Keep the television mounted until its exit finishes. The timer also works
    // when CSS animations are unavailable or the browser tab is backgrounded.
    const timer = window.setTimeout(() => finishCallback.current(), closing === 'reduced' ? 160 : 980)
    return () => clearTimeout(timer)
  }, [closing])
  useEffect(() => {
    if (props.reducedMotion) { setBooting(false); return }
    const timer = window.setTimeout(() => setBooting(false), 2100)
    return () => clearTimeout(timer)
  }, [props.reducedMotion])
  useEffect(() => {
    if (props.status !== 'ready') return
    let cancelled = false
    setReadStatus('loading')
    void props.api.loadGalaxyPreferences().then(value => {
      if (cancelled) return
      if (!Array.isArray(value.genres) || !Array.isArray(value.availableGenres) || !Array.isArray(value.artists) || !Array.isArray(value.songs)) throw new Error('INVALID_PREFERENCES')
      setPreferences(value)
      if (!initialized.current) { setDraft(readDraft(value)); initialized.current = true }
      setReadStatus('ready')
    }).catch(() => { if (!cancelled) setReadStatus('error') })
    return () => { cancelled = true }
  }, [props.api, props.status, readRetry])
  useEffect(() => { if (!booting) { scroll.current?.scrollTo?.({ top: 0 }); heading.current?.focus({ preventScroll: true }) } }, [page, channel, booting])

  const finishTuning = () => {
    if (closingStarted.current) return
    closingStarted.current = true
    props.onFinishRequested?.()
    setBooting(false)
    const reduceMotion = props.reducedMotion || typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setClosing(reduceMotion ? 'reduced' : 'full')
  }
  const move = (next: Page) => { setError(''); setPage(next) }
  const mergeTracks = (incoming: MusicTrackSummary[]) => {
    setCatalog(current => [...new Map([...current, ...incoming].map(track => [track.id, track])).values()])
    props.onTracks(incoming)
  }
  const savePreferences = async () => {
    if (locked.current || props.status !== 'ready' || readStatus !== 'ready' || !preferences || !genresValid) return
    locked.current = true; setBusy(true); setError('')
    try {
      const confirmed = await props.onSavePreferences({ genres: [...draft.genres], artists: draft.artists.map(item => item.id), songs: draft.songs.map(item => item.id) })
      if (!alive.current) return
      setPreferences(confirmed); setDraft(readDraft(confirmed)); move(owned ? 'formed' : 'songs')
    } catch { if (alive.current) setError('偏好还没有保存，选择都在。再试一次就好。') }
    finally { if (alive.current) { locked.current = false; setBusy(false) } }
  }
  const createPlanet = async () => {
    if (locked.current || owned || props.status !== 'ready') return
    if (!creationReady || !displayName.trim() || displayName.trim().length > 40 || tagline.trim().length > 120) {
      setError(!displayName.trim() ? '先给星球起个名字。' : !creationReady ? '请选择三首不同的歌。' : '名称最多 40 字，签名最多 120 字。'); return
    }
    locked.current = true; setBusy(true); setError('')
    try {
      const confirmed = await props.onCreatePlanet({ displayName: displayName.trim(), tagline: tagline.trim(), trackIds: [...selectedIds], visibility })
      if (alive.current) { setCreated(confirmed); move('formed') }
    } catch { if (alive.current) setError('星球还没有点亮，名字和三首歌都留着。可以再试一次。') }
    finally { if (alive.current) { locked.current = false; setBusy(false) } }
  }
  const showPlanet = owned && ['songs', 'profile', 'formed'].includes(page)
  const stage = page === 'welcome' ? 0 : page === 'preferences' ? 1 : page === 'tour' ? 3 : 2
  const channelName = booting ? '开机' : ['初次见面', '音乐偏好', '我的星球', '撞歌教学'][stage]
  return <section className="mosic-first-run" aria-label="MOSIC 首次调频" data-reduced-motion={props.reducedMotion} data-closing={closing ?? undefined}
    aria-busy={Boolean(closing)} style={{ '--first-run-shutdown-duration': `${closing === 'reduced' ? 160 : 980}ms` } as CSSProperties}>
    <DitherSurfaceDefinitions />
    <div className="first-run-tv" inert={Boolean(closing)}>
      <header className="first-run-header"><span className="first-run-brand">MOSIC</span><button type="button" aria-label="跳过首次调频" onClick={finishTuning}>跳过引导 ↗</button></header>
      <div className="first-run-glass"><CrtScreen active motion={!props.reducedMotion && !booting && !closing} enabled={props.crtEnabled}>
        <div ref={scroll} className="first-run-screen-content" data-booting={booting} aria-hidden={booting || undefined} inert={booting}>
          {page === 'welcome' && <div className="first-run-welcome">
            <PlanetSignal planet={owned} tracks={[]} />
            <div className="first-run-title"><span>收到一段新的频率</span><h1 ref={heading} tabIndex={-1}>把三首歌，<br />放进你的小宇宙。</h1><p>选喜欢的音乐，长出一颗星球。<br />再去看看，和你撞歌的人还在听什么。</p></div>
            <button type="button" className="first-run-primary" onClick={() => move('preferences')}>开始调频</button><span className="first-run-note">大约 2 分钟 · 随时可以跳过</span>
          </div>}
          {page === 'preferences' && <>
            <div className="first-run-title"><span>先调一调窗外的宇宙</span><h1 ref={heading} tabIndex={-1}>调到你喜欢的频率</h1><p>这些偏好决定 Galaxy 的候选；星球的三首歌，下一步再选。</p></div>
            {props.status === 'error' ? <div role="alert" className="first-run-feedback">连接还没有准备好。<button type="button" onClick={props.onRetry}>重新连接</button></div>
              : props.status !== 'ready' || readStatus === 'loading' ? <div className="first-run-loading" role="status"><span /><p>正在接收你的音乐偏好…</p></div>
                : readStatus === 'error' ? <div role="alert" className="first-run-feedback">原来的偏好还没有读到，暂时无法保存。<button type="button" onClick={() => setReadRetry(n => n + 1)}>重新读取偏好</button></div>
                  : <>
                    <nav className="first-run-channel-tabs" aria-label="偏好频道">{preferenceChannels.map(item => <button key={item.id} type="button" aria-label={`偏好频道 ${item.label}`}
                      aria-pressed={channel === item.id} disabled={busy} onClick={() => { setChannel(item.id); setError('') }}>{item.label}</button>)}</nav>
                    <div className="first-run-preference-panel">
                      <div className="first-run-preference-heading"><h2>{channel === 'genre' ? '常听哪些曲风？' : channel === 'artist' ? '想常常遇见谁的歌？' : '想从哪些歌出发？'}</h2><span>{channel === 'genre' ? draft.genres.length : channel === 'artist' ? draft.artists.length : draft.songs.length} 项已选</span></div>
                      <p className="first-run-note">{channel === 'genre' ? '选择 1–16 种曲风，之后也能随时调整。' : '艺人和歌曲留空会自动随机，之后也能随时调整。'}</p>
                      {channel === 'genre' ? <div className="first-run-checklist">{[...new Set([...(preferences?.availableGenres ?? []), ...draft.genres])].map(genre => <label key={genre}><input type="checkbox" aria-label={`偏好曲风 ${genre}`} checked={draft.genres.includes(genre)} disabled={busy || draft.genres.length >= 16 && !draft.genres.includes(genre)}
                        onChange={() => setDraft(current => ({ ...current, genres: current.genres.includes(genre) ? current.genres.filter(item => item !== genre) : current.genres.length < 16 ? [...current.genres, genre] : current.genres }))} /><span>{genre}</span></label>)}</div>
                        : <PreferenceOptions key={channel} api={props.api} kind={channel} selected={channel === 'artist' ? draft.artists : draft.songs} disabled={busy}
                          onChange={options => setDraft(current => ({ ...current, [channel === 'artist' ? 'artists' : 'songs']: options }))} />}
                    </div>
                    <div className="first-run-actions"><button type="button" disabled={busy} onClick={() => move('welcome')}>返回</button>
                      {channel !== 'song' ? <button type="button" className="first-run-primary" disabled={busy} onClick={() => setChannel(channel === 'genre' ? 'artist' : 'song')}>下一频道：{channel === 'genre' ? '艺人' : '歌曲'}</button>
                        : <button type="button" className="first-run-primary" disabled={busy || !genresValid} onClick={() => { void savePreferences() }}>{busy ? '正在保存…' : '保存偏好，继续'}</button>}</div>
                    {!genresValid && <p role="status" className="first-run-note">{draft.genres.length ? '曲风最多选 16 种，回到曲风频道调整一下。' : '先选至少一种曲风，再保存偏好。'}</p>}
                  </>}
          </>}
          {showPlanet ? <div className="first-run-formed"><PlanetSignal planet={owned} tracks={owned.tracks} /><div className="first-run-title"><span>音乐已经有了自己的落点</span><h1 ref={heading} tabIndex={-1}>{owned.displayName}，已在这里</h1><p>{owned.tagline || '这颗星球，装着你选中的歌。'}</p><small>{owned.visibility === 'public' ? '公开星球 · 其他人可以来听歌' : '私密星球 · 只向自己开放'}</small></div><div className="first-run-actions"><button type="button" className="first-run-primary" onClick={() => move('tour')}>继续：撞歌教学</button></div></div>
            : page === 'songs' && <>
              <div className="first-run-title"><span>三首歌，组成你的第一颗星球</span><h1 ref={heading} tabIndex={-1}>为你的星球选三首歌</h1><p>每放进一张 CD，星球都会长大一点。可以先试听，再收入架上。</p></div>
              <div className="first-run-song-build">
                <aside className="first-run-song-preview" aria-label="星球实时预览">
                  <PlanetSignal planet={null} tracks={selectedTracks} compact awaitingSong />
                  <output aria-label="星球选歌进度">已收集 {selectedIds.length} / 3 张 CD</output>
                </aside>
                <div className="first-run-song-picker">
                  {seedTracks.length > 0 && <button type="button" disabled={busy || selectedIds.length > 0} onClick={() => setSelectedIds(seedTracks.map(track => track.id))}>用已选偏好歌曲开头</button>}
                  <AudiusCdPicker api={props.api} tracks={allTracks} onTracks={mergeTracks} selectedIds={selectedIds} onToggle={trackId => {
                    if (busy || locked.current) return
                    setSelectedIds(current => current.includes(trackId) ? current.filter(id => id !== trackId) : current.length < 3 ? [...current, trackId] : current)
                  }} query={query} onQuery={setQuery} searchId={`first-run-${id}`} min={0} max={3} player={props.player} disabled={busy || props.status !== 'ready'} reducedMotion={props.reducedMotion} />
                </div>
              </div>
              <div className="first-run-actions"><button type="button" onClick={() => move('preferences')}>返回偏好</button><button type="button" className="first-run-primary" disabled={!creationReady || busy} onClick={() => move('profile')}>三首已选，继续</button></div>
            </>}
          {!showPlanet && page === 'profile' && <>
            <div className="first-run-title"><span>最后，留下一点你的名字</span><h1 ref={heading} tabIndex={-1}>让别人怎样找到你</h1><p>歌曲和外观都能以后再改，现在先给它一个名字。</p></div>
            <div className="first-run-profile"><PlanetSignal planet={null} tracks={selectedTracks} />
              <form onSubmit={event => { event.preventDefault(); void createPlanet() }}>
                <label className="first-run-field">星球名称<input aria-label="星球名称" value={displayName} maxLength={40} required autoComplete="off" disabled={busy} placeholder="给这个小宇宙起个名字" onChange={event => setDisplayName(event.target.value)} /></label>
                <label className="first-run-field">星球签名 <small>选填</small><input aria-label="星球签名" value={tagline} maxLength={120} disabled={busy} placeholder="最近想说的一句话" onChange={event => setTagline(event.target.value)} /></label>
                <fieldset className="first-run-privacy" disabled={busy}><legend>谁可以来访</legend><label><input type="radio" name={`privacy-${id}`} aria-label="公开星球" checked={visibility === 'public'} onChange={() => setVisibility('public')} /><span>公开星球<small>让撞歌的人来听听</small></span></label><label><input type="radio" name={`privacy-${id}`} aria-label="私密星球" checked={visibility === 'private'} onChange={() => setVisibility('private')} /><span>私密星球<small>先留给自己</small></span></label></fieldset>
                <div className="first-run-actions"><button type="button" disabled={busy} onClick={() => move('songs')}>返回选歌</button><button type="submit" className="first-run-primary" disabled={busy || !displayName.trim() || !creationReady || props.status !== 'ready'}>{busy ? '正在点亮…' : '点亮我的星球'}</button></div>
              </form>
            </div>
          </>}
          {page === 'tour' && <CollisionTutorial planet={owned} tracks={allTracks} onFinish={finishTuning} />}
          {error && <p className="first-run-feedback" role="alert">{error}</p>}
        </div>
        {booting && <div className="first-run-boot"><span className="first-run-boot-line" aria-hidden="true" /><span className="first-run-boot-static" aria-hidden="true" /><span className="first-run-boot-caption">MOSIC · 正在接收频率</span><button type="button" onClick={() => setBooting(false)}>跳过开机动画</button></div>}
      </CrtScreen></div>
      <aside className="first-run-tv-controls" aria-label="调频进度"><span className="first-run-model">STEREO<br />FM / AM</span><span className="first-run-channel-number" aria-label={`当前频道 ${stage + 1}`}>CH {String(stage + 1).padStart(2, '0')}</span><div className="first-run-dial" aria-hidden="true"><span style={{ transform: `rotate(${stage * 50 - 75}deg)` }} /></div><ol>{['初次见面', '音乐偏好', '我的星球', '撞歌教学'].map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined}><i aria-hidden="true" />{label}</li>)}</ol><span className="first-run-power"><i aria-hidden="true" /> ON</span><span className="first-run-speaker" aria-hidden="true" /></aside>
      <footer className="first-run-tv-footer"><span>FM 103.7</span><span role="status">{channelName}{busy ? ' · 等待确认' : ' · 信号接收中'}</span><span>♫ STEREO</span></footer>
    </div>
  </section>
}
