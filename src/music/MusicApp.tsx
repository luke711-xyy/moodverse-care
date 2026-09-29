import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { UniverseCanvas } from '../scene'
import type { MusicMoment, MusicPlanet, MusicPlanetVisual } from '../music-api'
import { createMusicApi, MusicApiError } from '../music-api'
import { classifyMusicApiError, togglePlanetTrack, validatePlanetDraft } from '../music-app-domain'
import type { MusicTrackSummary } from '../music-domain'
import type { Planet } from '../types'
import './music-app.css'

type HomeState =
  | { status: 'loading' }
  | { status: 'error'; kind: 'access-required' | 'request-failed' }
  | { status: 'ready'; tracks: MusicTrackSummary[]; planet: MusicPlanet | null; moments: MusicMoment[] }

type ComposerStatus = 'idle' | 'pending' | 'ready' | 'unavailable' | 'failed' | 'delayed'

const PLANET_PREVIEW: MusicPlanetVisual = {
  schemaVersion: 1,
  summary: '等待三首歌为它点亮第一层色彩。',
  palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' },
  atmosphere: 'starlit',
  motion: 'drift',
  particleDensity: .34,
}

function validVisual(value: unknown): value is MusicPlanetVisual {
  if (typeof value !== 'object' || value === null) return false
  const visual = value as Partial<MusicPlanetVisual>
  const isHexColor = (color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
  return visual.schemaVersion === 1
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

function apiErrorKind(error: unknown) {
  return error instanceof MusicApiError
    ? classifyMusicApiError(error.status, error.code)
    : 'request-failed'
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
    },
  }
}

function BrandMark() {
  return <span className="brand-lockup"><span className="brand-orb" aria-hidden="true"><i /></span><strong>MOODVERSE</strong></span>
}

function BrandHeader({ connected }: { connected: boolean }) {
  return <header className="music-topbar">
    <BrandMark />
    <div className="music-topbar-actions">
      <a className="music-legacy-link" href="/?legacy=1">经典星球版</a>
      <span className={`music-access-status${connected ? ' is-connected' : ''}`}><i />{connected ? 'Cloudflare Access · 邮箱已验证' : 'Cloudflare Access'}</span>
    </div>
  </header>
}

function Stage({ planet, previewSeed, reducedMotion }: { planet: MusicPlanet | null; previewSeed: string; reducedMotion: boolean }) {
  const scenePlanet = useMemo(() => toScenePlanet(planet, previewSeed), [planet, previewSeed])
  const visual = visualFor(planet)
  return <div className="music-scene-wrap" aria-hidden="true">
    <div className="music-fallback-planet" style={{ '--surface-color': visual.palette.surface, '--ocean-color': visual.palette.ocean, '--accent-color': visual.palette.accent } as CSSProperties} />
    <div className="music-scene-canvas">
      <UniverseCanvas
        view="self"
        focusedThemes={[]}
        ownPlanet={scenePlanet}
        ownPlanets={[scenePlanet]}
        starAppearance={{ color: visual.palette.accent }}
        selectedPlanet={scenePlanet}
        galaxyRotation={0}
        selfReturning={false}
        journey={0}
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
    </div>
  </div>
}

function errorMessage(error: unknown) {
  if (!(error instanceof MusicApiError)) return '暂时无法连接星际档案库。请稍后再试。'
  if (error.code === 'PLANET_ALREADY_EXISTS') return '你的星球已经创建好了。正在重新读取它。'
  if (error.code === 'UNKNOWN_OR_INACTIVE_TRACK') return '有歌曲已从曲库下架，请重新选择仍可用的曲目。'
  if (error.status === 401) return '请先通过 Cloudflare Access 完成邮箱验证，再继续。'
  return '保存没有完成，已保留当前填写内容。请检查连接后重试。'
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
  const [reducedMotion, setReducedMotion] = useState(false)

  const reloadHome = useCallback(async () => {
    setHome({ status: 'loading' })
    try {
      const { tracks, planet } = await api.loadHome()
      const moments = planet ? await api.loadMoments().catch(() => []) : []
      setHome({ status: 'ready', tracks, planet, moments })
      if (planet) {
        setMomentTrackId(planet.tracks.find((track) => track.isPrimary)?.id ?? planet.tracks[0]?.id ?? '')
        setComposerStatus(validVisual(planet.visual) ? 'ready' : 'idle')
      }
    } catch (error) {
      setHome({ status: 'error', kind: apiErrorKind(error) === 'access-required' ? 'access-required' : 'request-failed' })
    }
  }, [api])

  useEffect(() => { void reloadHome() }, [reloadHome])
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
  const previewSeed = selectedTrackIds.join('-')
  const activeVisual = visualFor(planet)

  const beginComposition = async (existingTask?: { id: string }) => {
    setComposerStatus('pending')
    try {
      const task = existingTask ? { task: { id: existingTask.id } } : await api.composePlanet()
      setComposerTaskId(task.task.id)
    } catch (error) {
      setComposerStatus(apiErrorKind(error) === 'ai-unavailable' ? 'unavailable' : 'failed')
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
    setCreatingPlanet(true)
    try {
      const result = await api.createPlanet({
        displayName: displayName.trim(),
        tagline: tagline.trim(),
        trackIds: selectedTrackIds,
        visibility: planetPrivate ? 'private' : 'public',
      })
      setHome((current) => current.status === 'ready'
        ? { ...current, planet: result.planet, moments: [] }
        : current)
      setMomentTrackId(result.planet.tracks.find((track) => track.isPrimary)?.id ?? result.planet.tracks[0]?.id ?? '')
      await beginComposition(result.compositionTask ? { id: result.compositionTask.id } : undefined)
    } catch (error) {
      setDraftError(errorMessage(error))
      if (error instanceof MusicApiError && error.code === 'PLANET_ALREADY_EXISTS') void reloadHome()
    } finally {
      setCreatingPlanet(false)
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
    setSavingMoment(true)
    setMomentFeedback('')
    try {
      const result = await api.createMoment({
        trackId: momentTrackId,
        contentText: momentText.trim(),
        visibility: momentPrivate ? 'private' : 'public',
      })
      if (result.moment) setHome((current) => current.status === 'ready'
        ? { ...current, moments: [result.moment!, ...current.moments] }
        : current)
      setMomentText('')
      setMomentFeedback(momentPrivate ? '已保存为仅自己可见。' : 'Moment 已公开，星球开始吸收新的声音。')
      if (result.compositionTask) await beginComposition({ id: result.compositionTask.id })
      else await beginComposition()
    } catch (error) {
      setMomentFeedback(errorMessage(error))
    } finally {
      setSavingMoment(false)
    }
  }

  const retryComposition = () => { void beginComposition() }

  if (home.status === 'loading') return <main className="music-app music-loading"><BrandHeader connected={false} /><div className="music-loading-mark" role="status"><span /><p>正在校准你的星际档案…</p></div></main>

  if (home.status === 'error') return <main className="music-app music-gate">
    <BrandHeader connected={false} />
    <section className="music-gate-copy" aria-live="polite">
      <span className="music-kicker">身份校验 · CLOUDFLARE ACCESS</span>
      <h1>{home.kind === 'access-required' ? '先验证你的邮箱，\n再进入 Moodverse' : '暂时连接不上，\n星际档案仍在原处'}</h1>
      <p>{home.kind === 'access-required'
        ? '此产品使用 Cloudflare Access 邮箱一次性验证码登录，不会另设密码。若你刚完成验证，请重新读取一次。'
        : '没有任何资料被覆盖。可以稍后重新尝试连接。'}</p>
      <button className="music-primary-button" type="button" onClick={() => { void reloadHome() }}>重新检查邮箱验证 <span aria-hidden="true">↗</span></button>
    </section>
  </main>

  const connected = home.status === 'ready'
  const canCreate = home.status === 'ready' && !planet

  return <main className={`music-app${planet ? ' has-planet' : ' is-onboarding'}`}>
    <Stage planet={planet} previewSeed={previewSeed} reducedMotion={reducedMotion} />
    <BrandHeader connected={connected} />

    <div className="music-layout">
      <section className="music-copy">
        <span className="music-kicker">{planet ? '你的星球 · 正在播放自己的宇宙' : '从三首歌开始 · 让星球有形状'}</span>
        <h1>{planet ? <>{planet.displayName}<em>在歌声里生长。</em></> : <>把喜欢的歌<br /><em>安放成一颗星球。</em></>}</h1>
        <p>{planet
          ? planet.tagline || '选中的歌曲会成为它的轨道；你留下的 Moment，会让它继续变化。'
          : '挑三首此刻愿意留在身边的歌。星球由歌曲和你公开分享的 Moment 慢慢长出自己的颜色。'}</p>
        {planet && <div className="music-world-readout" aria-live="polite">
          <span className={`music-ai-indicator is-${composerStatus}`}><i />{composerStatus === 'pending' ? '本地 AI 正在生成星球' : composerStatus === 'ready' ? '星球视觉已生成' : composerStatus === 'unavailable' ? '本地 AI 通道尚未连接' : composerStatus === 'failed' ? '星球视觉暂时未更新' : composerStatus === 'delayed' ? '生成时间较长，星球已保存' : '星球等待第一次视觉生成'}</span>
          <p>{activeVisual.summary}</p>
          {(composerStatus === 'unavailable' || composerStatus === 'failed' || composerStatus === 'delayed' || composerStatus === 'idle') && <button type="button" className="music-text-button" onClick={retryComposition}>重试星球生成</button>}
        </div>}
      </section>

      {canCreate ? <aside className="music-panel music-create-panel" aria-label="创建音乐星球">
        {!tracks.length ? <div className="music-empty-catalog" role="status">
          <span className="music-kicker">曲库 · 暂未开放</span>
          <h2>曲库还没有可选歌曲</h2>
          <p>添加曲目后，你就可以开始创建星球。我们只展示可控曲库中的歌曲，并跳转到官方平台播放。</p>
        </div> : <form onSubmit={createPlanet}>
          <div className="music-panel-head"><div><span className="music-kicker">第一步 · 选择声音</span><h2>为你的星球选三首歌</h2></div><span className="music-count" aria-live="polite">{selectedTrackIds.length}<i>/3</i></span></div>
          <p className="music-panel-note">你的星球默认公开，可随时改为仅自己可见。完整音频不会嵌入 Moodverse。</p>
          <label className="music-search-label" htmlFor="music-track-search">搜索曲名或艺人</label>
          <input id="music-track-search" className="music-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="曲名、艺人、曲风" />
          <div className="music-track-list" role="group" aria-label="曲库">
            {visibleTracks.map((track) => {
              const selected = selectedTrackIds.includes(track.id)
              const disabled = !selected && selectedTrackIds.length >= 3
              return <button className={`music-track-choice${selected ? ' is-selected' : ''}`} type="button" key={track.id} aria-label={`${track.title} · ${track.artistName}`} aria-pressed={selected} disabled={disabled} onClick={() => toggleTrack(track.id)}>
                {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
                <span className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.versionLabel ? ` · ${track.versionLabel}` : ''}</small></span>
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

      {planet && <aside className="music-panel music-planet-panel" aria-label="我的音乐星球">
        <div className="music-panel-head"><div><span className="music-kicker">星球轨道 · {planet.visibility === 'public' ? '公开访问' : '仅自己'}</span><h2>留在这里的歌</h2></div><span className="music-count">{planet.tracks.length}<i>首</i></span></div>
        <div className="music-owned-track-list">
          {planet.tracks.map((track) => <article className="music-owned-track" key={track.id}>
            {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <span className="music-cover-fallback" aria-hidden="true">♫</span>}
            <div className="music-track-label"><strong>{track.title}</strong><small>{track.artistName}{track.isPrimary ? ' · 星球主旋律' : ''}</small></div>
            {track.officialUrl
              ? <a href={track.officialUrl} target="_blank" rel="noreferrer" aria-label={`${track.title} · ${track.artistName} · 在官方平台打开`}>↗</a>
              : <span className="music-link-unavailable" title="暂无官方播放链接">—</span>}
          </article>)}
        </div>

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
          {!moments.length ? <p className="music-moments-empty">还没有 Moment。写下一段真实的片刻，星球就会继续变化。</p> : moments.slice(0, 5).map((moment) => <article className="music-moment-item" key={moment.id}>
            <div><strong>{moment.track.title}</strong><span>{moment.visibility === 'public' ? '公开' : '仅自己'} · {new Date(moment.createdAt).toLocaleDateString('zh-CN')}</span></div>
            {moment.contentText && <p>{moment.contentText}</p>}
          </article>)}
        </section>
      </aside>}
    </div>
  </main>
}

export default MusicApp
