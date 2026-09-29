import { type CSSProperties, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { getVisiblePlanets, useAppStore } from './store'
import { billboardTextParts, planetBillboards } from './billboards'
import { UniverseCanvas } from './scene'
import { adjacentOwnPlanetIndex, adjacentPlanetIndex, earliestActivePlanetId, selfPlanetWheelAction } from './scene-state'
import { advanceJourney, getCurrentTourAnchorIndex, getSelfReturnJourneyProgress, getTourTrackProgress, hasReachedTourAnchor, normalizeWheelDelta, SELF_RETURN_CLOUD_DURATION_MS, SELF_RETURN_TOUR_DURATION_MS, PORTAL_START, TOUR_END, TOUR_OVERSHOOT } from './universe'
import { summarizePlanetWeather } from './climate'
import { drawDoodleStrokes } from './doodle'
import { moodById, MOODS, themeById, THEMES, TRIGGERS, todayKey, type Billboard, type DoodleStroke, type MoodEntry, type MoodId, type Planet, type PrivacyMode, type StarAppearance, type ThemeId } from './types'
import './styles.css'

type IconName = 'orbit' | 'lock' | 'arrow' | 'back' | 'history' | 'plus' | 'close' | 'send' | 'music' | 'spark' | 'share' | 'settings'

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    orbit: 'M3 8a5 5 0 0 0 9.2 2.8M13 8a5 5 0 0 0-9.2-2.8M8 3v2m0 6v2m-5-5h2m6 0h2',
    lock: 'M5 7V5a3 3 0 0 1 6 0v2m-7 0h8v6H4z',
    arrow: 'M3 8h9m-3-3 3 3-3 3',
    back: 'M11 3 6 8l5 5M6 8h7',
    history: 'M3 8a5 5 0 1 0 1.5-3.5M3 3v3h3M8 5v3l2 1',
    plus: 'M8 3v10M3 8h10',
    close: 'm4 4 8 8M12 4l-8 8',
    send: 'm3 8 10-5-3 10-2.2-4.1zM7.8 8.9 13 3',
    music: 'M5 11V4l7-1v7M5 11a2 2 0 1 1-2 2 2 2 0 0 1 2-2Zm7-1a2 2 0 1 1-2 2 2 2 0 0 1 2-2Z',
    spark: 'm8 2 .8 3.2L12 6l-3.2.8L8 10l-.8-3.2L4 6l3.2-.8zm4 8 .4 1.6L14 12l-1.6.4L12 14l-.4-1.6L10 12l1.6-.4z',
    share: 'M10 4h3v3M13 4 8 9M12 9v4H3V4h4',
    settings: 'M8 2.2v1.2m0 9.2v1.2M2.2 8h1.2m9.2 0h1.2M3.9 3.9l.9.9m6.4 6.4.9.9m0-8.2-.9.9m-6.4 6.4-.9.9M8 5.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z',
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function Brand() {
  return <div className="brand-lockup"><span className="brand-orb" aria-hidden="true"><i /></span><strong>MOODVERSE</strong></div>
}

function TopBar({ onHome, onSettings, settingsOpen, homeLabel }: { onHome: () => void; onSettings: () => void; settingsOpen: boolean; homeLabel: string }) {
  return <header className="topbar">
    <button className="brand-button" onClick={onHome} aria-label={homeLabel}><Brand /></button>
    <div className="topbar-actions">
      <a className="top-mode-switch" href="/">音乐星球版</a>
      <button className={`top-settings${settingsOpen ? ' is-active' : ''}`} onClick={onSettings} aria-label="设置" aria-pressed={settingsOpen}><Icon name="settings" size={17} /><span>设置</span></button>
    </div>
  </header>
}

function SceneIntro({ view, focusedTheme, focusedThemeCount, hasPlanet, hasRecordedToday, onCompose, onMine }: { view: string; focusedTheme?: ThemeId; focusedThemeCount: number; hasPlanet: boolean; hasRecordedToday: boolean; onCompose: () => void; onMine: () => void }) {
  const theme = focusedTheme ? themeById(focusedTheme) : undefined
  if (view === 'home-galaxy') return <div className="scene-copy home-galaxy-copy"><h1>自己的星系<br /><em>六颗星球的位置。</em></h1><p className="lede">选择一颗星球进入详情，空着的轨道可以孕育新星球。点击中央恒星调整它的光。</p></div>
  if (view === 'self') return <div className="scene-copy self-copy"><h1>{hasPlanet ? <>今天的天气<br /><em>已经被记住。</em></> : <>一颗星球<br /><em>正在等你。</em></>}</h1><p className="lede">{hasPlanet ? '上下滚轮切换星球；回到最早一颗后可返回自己的星系。按住左键可转动星球。' : '为它命名，写下第一天。按住左键，可以触碰这颗尚未成形的星球。'}</p><button className="primary-button" onClick={onCompose} disabled={hasPlanet && hasRecordedToday}><Icon name="plus" /> {hasPlanet ? hasRecordedToday ? '今日已记录' : '写下今天' : '写下第一天'} {!hasRecordedToday && <span>↗</span>}</button></div>
  if (view === 'planet' && theme) return <div className="scene-copy"><h1>有人正在<br /><em>经过这里。</em></h1><p className="lede">左键拖动转动星球，滚轮切换同星系星球，也可以在右侧留下一句温柔的话。</p></div>
  if (view === 'galaxy' && theme) return <div className="scene-copy"><h1>{theme.short}<br /><em>正在发光。</em></h1><p className="lede">滚轮旋转星系，点击星球查看详情。</p></div>
  return <div className="scene-copy"><h1>把今天的心情<br /><em>放进宇宙。</em></h1><p className="lede">{focusedThemeCount ? `滚动探索 ${focusedThemeCount} 个关注星系，穿过星云后抵达自己的星系。` : '宇宙暂时没有关注的星系；可以在设置中选择主题，或直接前往自己的星系。'}</p><div className="scene-actions"><button className="primary-button" onClick={onMine}><Icon name="orbit" /> 环游到自己的星系 <span>↗</span></button></div></div>
}

function UniverseLegend({ themes, onSelect, onSettings }: { themes: ThemeId[]; onSelect: (theme: ThemeId) => void; onSettings: () => void }) {
  return <nav className="legend" aria-label="生活主线星系">
    <div className="legend-heading"><span>生活主线</span></div>
    <div className="legend-list">
      {themes.map((id) => { const theme = themeById(id); return <button key={theme.id} className="legend-item" onClick={() => onSelect(theme.id)}><i style={{ '--theme': theme.color, '--glow': theme.glow } as CSSProperties}>{theme.glyph}</i><span>{theme.label}</span></button> })}
      {!themes.length && <div className="legend-empty"><p>还没有关注的主线。</p><button type="button" onClick={onSettings}>去设置中选择</button></div>}
    </div>
  </nav>
}

function PortalOverlay({ portal, returning }: { portal: number; returning: boolean }) {
  const veil = Math.sin(Math.max(0, Math.min(1, portal)) * Math.PI)
  const opacity = veil
  const caption = returning
    ? '正在回到宇宙'
    : portal < .38
      ? '星系巡游完成 · 前方进入星云'
      : '正在抵达 · 你的星系'
  if (opacity < 0.015 || !caption) return null
  return <div className="portal-layer" aria-hidden="true" style={{ '--portal': opacity } as CSSProperties}><div className="portal-caption">{caption}</div></div>
}

function PlanetDetails({ planet, replies, billboardId, detailStatus, onReply, onClose }: { planet: Planet; replies: Array<{ id: string; text: string; authorName?: string }>; billboardId?: string; detailStatus: 'loading' | 'ready' | 'error' | 'idle'; onReply: (text: string) => void; onClose: () => void }) {
  const theme = themeById(planet.theme)
  const mood = moodById(planet.mood)
  const weather = useMemo(() => summarizePlanetWeather(planet.id, planet.mood, planet.intensity, planet.weatherHistory), [planet.id, planet.mood, planet.intensity, planet.weatherHistory])
  const billboards = planetBillboards(planet)
  const [reply, setReply] = useState('')
  return <aside className="drawer planet-drawer" aria-label="星球详情">
    <div className="drawer-top"><div><span className="drawer-kicker" style={{ color: theme.color }}><i style={{ background: theme.color }} /> {theme.label}</span><h2>{planet.alias}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭星球详情"><Icon name="close" /></button></div>
    <div className="signal-row"><span className="mood-chip" style={{ '--mood': mood.color } as CSSProperties}>{mood.glyph} {mood.label}</span><span className="signal-text">强度 {planet.intensity}/5</span></div>
    <section className="climate-readout" aria-label="星球气候"><div><span>星球天气</span></div><p>{weather.title}</p><small>{weather.detail}</small></section>
    {(planet.tagline || planet.message) && <p className="planet-message">“{planet.tagline || planet.message}”</p>}
    {billboards.length ? billboards.map((board) => <section className={`billboard${billboardId === board.id ? ' is-selected' : ''}`} key={board.id}>
      <div className="billboard-head"><span><Icon name="spark" size={13} />{board.kind === 'ai' ? '关怀告示' : '告示牌'}</span>{board.expiresAt && <small>{new Date(board.expiresAt).toLocaleDateString()}</small>}</div>
      {board.title && <strong className="public-billboard-title">{board.title}</strong>}
      <p>{board.text}</p>
    </section>) : detailStatus === 'loading' ? <section className="billboard billboard-status" role="status">正在从星云档案读取告示牌…</section> : detailStatus === 'error' ? <section className="billboard billboard-status" role="status">暂时无法连接档案库；若有已缓存内容，会继续保留显示。</section> : null}
    {planet.musicUrl && <a className="music-link" href={planet.musicUrl} target="_blank" rel="noreferrer"><Icon name="music" /> 在网易云打开这首歌 <Icon name="arrow" size={13} /></a>}
    <section className="reply-section"><div className="section-label"><span>留下一点回应</span></div><div className="reply-form"><textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={160} placeholder="我也在这里，听见你了……" aria-label="给这颗星球留言" /><button className="send-button" disabled={!reply.trim()} onClick={() => { onReply(reply); setReply('') }} aria-label="发送留言"><Icon name="send" /></button></div><span className="privacy-note"><Icon name="lock" size={12} /> 匿名留言</span></section>
    <section className="replies"><div className="section-label"><span>路过的光</span><small>{replies.length} 条</small></div>{replies.length ? replies.slice(0, 3).map((item) => <p className="reply-item" key={item.id}><i />{item.text}</p>) : <p className="empty-replies">还没有人留言。你可以成为第一束光。</p>}</section>
  </aside>
}

function OwnBillboardList({ billboards, selectedId, onSelect, onDelete }: { billboards: Billboard[]; selectedId?: string; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  return <section className="self-billboard-panel" aria-label="星球上的告示牌">
    <div className="self-billboard-panel-head"><span>星球告示牌</span><small>{billboards.length}</small></div>
    <div className="self-billboard-list">
      {!billboards.length && <p className="self-billboard-empty">还没有告示牌。今天的记录可以成为第一块木牌。</p>}
      {billboards.map((billboard) => {
        const { title, body } = billboardTextParts(billboard)
        const label = billboard.kind === 'ai' ? 'AI 关怀' : '我的告示'
        return <article className={`self-billboard${selectedId === billboard.id ? ' is-selected' : ''}`} key={billboard.id}>
          <div className="self-billboard-head"><span><Icon name="spark" size={12} /> {label}</span><button type="button" className="self-billboard-delete" aria-label={`删除告示牌：${title}`} title="删除告示牌" onClick={() => onDelete(billboard.id)}>×</button></div>
          <button type="button" className="self-billboard-content" aria-pressed={selectedId === billboard.id} onClick={() => onSelect(billboard.id)}>
            <strong>{title}</strong>
            <p>{body || '留在星球上的一份心意。'}</p>
          </button>
        </article>
      })}
    </div>
  </section>
}

function OwnPlanetInfo({ planet, entries }: { planet?: Planet; entries: MoodEntry[] }) {
  if (!planet) return <section className="self-info" aria-label="待创建的星球"><div className="self-info-kicker"><span className="self-info-orb is-embryo" /> 待命名的星球</div><h2>从第一天天气开始</h2><p className="self-info-empty">选一个生活主线，写下名字和今天的心情，它会慢慢长成你的星球。</p></section>
  const theme = themeById(planet.theme)
  const todays = entries.filter((entry) => entry.planetId === planet.id && entry.date === todayKey()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latest = todays[0]
  const mood = latest ? moodById(latest.mood) : undefined
  const weather = summarizePlanetWeather(planet.id, planet.mood, planet.intensity, planet.weatherHistory)
  return <section className="self-info" aria-label="自己的星球信息" style={{ '--own-theme': theme.color, '--own-glow': theme.glow } as CSSProperties}>
    <div className="self-info-main"><div className="self-info-copy">
      <div className="self-info-kicker"><span className="self-info-orb" /> {theme.label}</div>
      <h2>{planet.alias}</h2>
      <div className="self-info-weather"><span className="self-info-label">今日心情</span><strong className={mood ? 'self-info-mood' : undefined} style={mood ? { color: mood.color } : undefined}>{mood ? `${mood.glyph} ${mood.label} · 强度 ${latest.intensity}/5` : '尚未记录'}</strong></div>
    </div>{planet.doodle?.length ? <div className="self-info-doodle"><DoodlePreview strokes={planet.doodle} className="self-info-doodle-canvas" /></div> : null}</div>
    <div className="self-info-weather"><span className="self-info-label">星球天气</span><span className="self-info-weather-copy"><strong>{weather.title}</strong><small>{weather.detail}</small></span></div>
    {planet.tagline && <p className="self-info-tagline">“{planet.tagline}”</p>}
  </section>
}

const DOODLE_COLORS = [
  { label: '月光白', value: '#eef6ff' },
  { label: '星云金', value: '#ffd36b' },
  { label: '薄荷绿', value: '#7ff2cc' },
  { label: '极光蓝', value: '#72cfff' },
  { label: '暮光粉', value: '#ff82bd' },
  { label: '梦境紫', value: '#c39cff' },
]

function DoodlePad({ value, onChange, color, onColorChange }: { value: DoodleStroke[]; onChange: (value: DoodleStroke[]) => void; color: string; onColorChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<DoodleStroke | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    drawDoodleStrokes(ctx, value, rect.width, rect.height)
  }, [value])
  const point = (event: PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))] as [number, number] }
  const clear = () => { drawing.current = null; onChange([]) }
  return <div className="doodle-wrap"><div className="doodle-head"><span>涂鸦</span><button type="button" onClick={clear}>清空</button></div><div className="doodle-tools" role="group" aria-label="选择涂鸦颜色">{DOODLE_COLORS.map((swatch) => <button type="button" key={swatch.value} className={`doodle-swatch${color === swatch.value ? ' is-selected' : ''}`} style={{ '--swatch': swatch.value } as CSSProperties} aria-label={swatch.label} aria-pressed={color === swatch.value} title={swatch.label} onClick={() => onColorChange(swatch.value)} />)}</div><canvas ref={canvasRef} className="doodle-pad" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const stroke: DoodleStroke = { points: [point(event)], color, width: .012, coordinateSpace: 'normalized' }; drawing.current = stroke; onChange([...value, stroke]) }} onPointerMove={(event) => { if (!drawing.current) return; const stroke = { ...drawing.current, points: [...drawing.current.points, point(event)] }; drawing.current = stroke; onChange([...value.slice(0, -1), stroke]) }} onPointerUp={() => { drawing.current = null }} onPointerCancel={() => { drawing.current = null }} aria-label="方形涂鸦画板" /></div>
}

function ComposePanel({ planet, takenThemes, editingEntry, forceFirstDay = false, onClose, onSaved }: { planet?: Planet; takenThemes: ThemeId[]; editingEntry?: MoodEntry; forceFirstDay?: boolean; onClose: () => void; onSaved: (created: boolean) => void }) {
  const createPlanetAndFirstCheckIn = useAppStore((state) => state.createPlanetAndFirstCheckIn)
  const saveCheckIn = useAppStore((state) => state.saveCheckIn)
  const updateTodayEntry = useAppStore((state) => state.updateTodayEntry)
  const firstDay = forceFirstDay || !planet
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [theme, setTheme] = useState<ThemeId | undefined>(planet?.theme)
  const [mood, setMood] = useState<MoodId>(editingEntry?.mood ?? 'calm')
  const [intensity, setIntensity] = useState(editingEntry?.intensity ?? 3)
  const [triggers, setTriggers] = useState<string[]>(editingEntry?.triggers ?? [])
  const [privateNote, setPrivateNote] = useState(editingEntry?.privateNote ?? '')
  const [publicMessage, setPublicMessage] = useState(editingEntry?.publicMessage ?? '')
  const [musicUrl, setMusicUrl] = useState(editingEntry?.musicUrl ?? '')
  const [privacy, setPrivacy] = useState<PrivacyMode>(editingEntry?.privacy ?? 'private')
  const [doodle, setDoodle] = useState<DoodleStroke[]>(editingEntry?.doodle ?? [])
  const [doodleColor, setDoodleColor] = useState(DOODLE_COLORS[1].value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toggleTrigger = (item: string) => setTriggers((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (firstDay && !name.trim()) { setError('请先给星球取一个名字。'); return }
    if (!theme) { setError('请选择这颗星球的生活主线。'); return }
    setBusy(true); setError('')
    const input = { theme, mood, intensity, triggers, privateNote, publicMessage: privacy === 'billboard_public' ? publicMessage : '', privacy, musicUrl, doodle }
    try {
      const result = firstDay
        ? await createPlanetAndFirstCheckIn({ ...input, name: name.trim(), tagline: tagline.trim() })
        : editingEntry
          ? await updateTodayEntry(planet.id, editingEntry.id, input)
          : await saveCheckIn({ ...input, planetId: planet!.id })
      if (result.ok) onSaved(firstDay)
      else setError(result.error || '保存失败，填写的内容仍在，请稍后重试。')
    } catch { setError('暂时无法保存。填写的内容仍在，请检查网络后重试。') }
    finally { setBusy(false) }
  }
  return <aside className="drawer compose-drawer" aria-label={firstDay ? '写下第一天' : '写下今天的情绪'}><div className="drawer-top"><div><span className="drawer-kicker"><i className="copper-dot" /> DAILY CHECK-IN · {todayKey().replaceAll('-', '.')}</span><h2>{firstDay ? '写下第一天' : editingEntry ? '编辑今天' : '写下今天'}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭记录面板"><Icon name="close" /></button></div><p className="drawer-lede">{firstDay ? '第一天决定星球的主线与颜色。确认后，主线就会固定。' : '不必写得完整。今天可以留下一条，也可以再写一条。'}</p><form onSubmit={submit} style={{ '--mood-color': moodById(mood).color } as CSSProperties}>
    {firstDay && <><div className="field-group"><label htmlFor="planet-name">星球的名字 <small>必填</small></label><input className="text-field" id="planet-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required placeholder="给这颗星球一个名字" /></div><div className="field-group"><label htmlFor="planet-tagline">星球标语 <small>可以留空</small></label><input className="text-field" id="planet-tagline" value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={100} placeholder="一句想留给自己的话" /></div><div className="field-group"><label>最近在…… <small>仅第一天可选</small></label><div className="choice-grid theme-choices">{THEMES.map((item) => <button type="button" key={item.id} disabled={takenThemes.includes(item.id)} aria-pressed={theme === item.id} className={theme === item.id ? 'choice is-selected' : 'choice'} onClick={() => setTheme(item.id)}><i style={{ background: item.color, boxShadow: `0 0 16px ${item.glow}` }} />{item.label}{takenThemes.includes(item.id) && <small>已有</small>}</button>)}</div></div></>}
    {!firstDay && <div className="locked-theme"><span>生活主线</span><strong style={{ color: themeById(planet.theme).color }}>{themeById(planet.theme).label}</strong><small>这颗星球的主题已在第一天确定</small></div>}
    <div className="field-group"><label>今天的心情</label><div className="choice-grid mood-choices">{MOODS.map((item) => <button type="button" key={item.id} aria-pressed={mood === item.id} className={mood === item.id ? 'choice is-selected' : 'choice'} style={{ '--mood-color': item.color } as CSSProperties} onClick={() => setMood(item.id)}><span>{item.glyph}</span>{item.label}</button>)}</div></div>
    <div className="field-group intensity-field"><label htmlFor="intensity">这份感觉有多强？ <output>{intensity}/5</output></label><input id="intensity" type="range" min="1" max="5" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} /></div>
    <div className="field-group"><label>可能的触发因素 <small>可多选</small></label><div className="tag-row">{TRIGGERS.map((item) => <button type="button" key={item} className={`tag-button ${triggers.includes(item) ? 'is-selected' : ''}`} onClick={() => toggleTrigger(item)}>{item}</button>)}</div></div>
    <div className="field-group"><label htmlFor="private-note">给自己的话 <small>仅自己可见</small></label><textarea id="private-note" value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} maxLength={600} placeholder="今天发生了什么？身体有什么感觉？" /><span className="field-count">{privateNote.length}/600</span></div>
    <div className="field-group public-field"><label htmlFor="public-message">星球上的告示牌 <small>可选 · 最多 500 字</small></label><textarea id="public-message" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={500} placeholder="留一句给路过的人……" /><span className="field-count">{Array.from(publicMessage).length}/500</span></div>
    <DoodlePad value={doodle} onChange={setDoodle} color={doodleColor} onColorChange={setDoodleColor} />
    <div className="field-group"><label htmlFor="music-url">一首歌 <small>网易云链接，可选</small></label><div className="input-with-icon"><Icon name="music" size={15} /><input id="music-url" value={musicUrl} onChange={(event) => setMusicUrl(event.target.value)} placeholder="https://music.163.com/..." /></div></div>
    <fieldset className="privacy-field"><legend>谁能看见这条记录？</legend><label><input type="radio" name="privacy" checked={privacy === 'private'} onChange={() => setPrivacy('private')} /><span><b>仅自己</b><small>完整日记和触发因素都留在这里</small></span></label><label><input type="radio" name="privacy" checked={privacy === 'mood_theme_public'} onChange={() => setPrivacy('mood_theme_public')} /><span><b>公开主线与心情</b><small>别人只能看到星球的主题和天气</small></span></label><label><input type="radio" name="privacy" checked={privacy === 'billboard_public'} onChange={() => setPrivacy('billboard_public')} /><span><b>公开告示牌</b><small>把上面的留言和涂鸦给路过的人</small></span></label></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button full-button" type="submit" disabled={busy}><Icon name="spark" /> {busy ? '正在保存…' : firstDay ? '让星球诞生' : editingEntry ? '保存今天的修改' : '让星球记住今天'} <span>↗</span></button>
  </form></aside>
}

type AlmanacView = 'day' | 'week' | 'month' | 'year'
const localKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fromKey = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day) }
const moveDate = (key: string, days: number) => { const date = fromKey(key); date.setDate(date.getDate() + days); return localKey(date) }
const monthLabel = (key: string) => { const date = fromKey(key); return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` }
const readableDate = (key: string) => { const date = fromKey(key); return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日` }
const weekAnchor = (key: string) => { const date = fromKey(key); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return localKey(date) }
const entryWeatherTitle = (planet: Planet, entry: MoodEntry) => summarizePlanetWeather(
  planet.id,
  entry.mood,
  entry.intensity,
  (planet.weatherHistory ?? []).filter((sample) => sample.date <= entry.date),
).title

function MoodRing({ entry, size = 42 }: { entry?: MoodEntry; size?: number }) {
  const color = entry ? moodById(entry.mood).color : 'var(--line-strong)'
  const circumference = 2 * Math.PI * 18
  return <span className={`mood-ring${entry ? ' has-entry' : ''}`} style={{ width: size, height: size, '--ring-color': color } as CSSProperties} aria-hidden="true"><svg viewBox="0 0 44 44"><circle className="mood-ring-track" cx="22" cy="22" r="18" /><circle className="mood-ring-fill" cx="22" cy="22" r="18" style={{ strokeDasharray: `${entry ? circumference * entry.intensity / 5 : 0} ${circumference}` }} /></svg><span>{entry ? moodById(entry.mood).glyph : '·'}</span></span>
}

function DoodlePreview({ strokes, className = 'almanac-doodle' }: { strokes: DoodleStroke[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const size = canvas.clientWidth; if (!size) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size)
    drawDoodleStrokes(ctx, strokes, size, size)
  }, [strokes])
  return <canvas className={className} ref={ref} aria-label="当日涂鸦" />
}

function HistoryPanel({ planet, entries, readOnly, onClose, onEdit, onAddToday }: { planet: Planet; entries: MoodEntry[]; readOnly?: boolean; onClose: () => void; onEdit: (entry: MoodEntry) => void; onAddToday: () => void }) {
  const loadPlanetHistory = useAppStore((state) => state.loadPlanetHistory)
  const [view, setView] = useState<AlmanacView>('week')
  const [selectedDate, setSelectedDate] = useState(todayKey())
  useEffect(() => { void loadPlanetHistory(planet.id) }, [loadPlanetHistory, planet.id])
  const planetEntries = useMemo(() => entries.filter((entry) => entry.planetId === planet.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [entries, planet.id])
  const byDate = useMemo(() => {
    const map = new Map<string, MoodEntry[]>()
    for (const entry of planetEntries) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return map
  }, [planetEntries])
  const selectedEntries = byDate.get(selectedDate) ?? []
  const latestFor = (key: string) => byDate.get(key)?.[0]
  const today = todayKey()
  const weekStart = weekAnchor(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => moveDate(weekStart, index))
  const month = fromKey(selectedDate)
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthOffset = (monthStart.getDay() + 6) % 7
  const monthLength = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthCells = Array.from({ length: Math.ceil((monthOffset + monthLength) / 7) * 7 }, (_, index) => index - monthOffset + 1)
  const year = month.getFullYear()
  const navigate = (direction: -1 | 1) => {
    if (view === 'day') setSelectedDate(moveDate(selectedDate, direction))
    if (view === 'week') setSelectedDate(moveDate(selectedDate, direction * 7))
    if (view === 'month') setSelectedDate(localKey(new Date(year, month.getMonth() + direction, 1)))
    if (view === 'year') setSelectedDate(localKey(new Date(year + direction, 0, 1)))
  }
  const periodLabel = view === 'day' ? readableDate(selectedDate) : view === 'week' ? `${weekDays[0].slice(5).replace('-', '/')} — ${weekDays[6].slice(5).replace('-', '/')}` : view === 'month' ? monthLabel(selectedDate) : `${year} 年`
  const canNavigateForward = view === 'day' ? selectedDate < today : view === 'week' ? weekStart < weekAnchor(today) : view === 'month' ? selectedDate.slice(0, 7) < today.slice(0, 7) : year < fromKey(today).getFullYear()
  const selectedMood = latestFor(selectedDate)
  return <aside className="drawer history-drawer" aria-label={`${planet.alias}的星球年鉴`}><div className="drawer-top"><div><span className="drawer-kicker"><i className="teal-dot" /> PLANET ALMANAC · {themeById(planet.theme).label}</span><h2>星球年鉴</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭星球年鉴"><Icon name="close" /></button></div><p className="drawer-lede">{planet.alias}的每一天，都只属于这颗星球。环形记录表示当时的心情与强度，没有分数，也没有打卡要求。</p>
    <div className="range-tabs almanac-tabs" role="tablist" aria-label="年鉴时间尺度">{([['day', '日'], ['week', '周'], ['month', '月'], ['year', '年']] as const).map(([value, label]) => <button role="tab" aria-selected={view === value} key={value} className={view === value ? 'is-active' : ''} onClick={() => setView(value)}>{label}</button>)}</div>
    <div className="almanac-period"><button type="button" onClick={() => navigate(-1)} aria-label="上一时段">‹</button><strong>{periodLabel}</strong><button type="button" onClick={() => navigate(1)} aria-label="下一时段" disabled={!canNavigateForward}>›</button></div>
    {view === 'day' && <div className="almanac-day-focus" style={{ '--mood-color': selectedMood ? moodById(selectedMood.mood).color : 'var(--muted)' } as CSSProperties}><MoodRing entry={selectedMood} size={78} /><div><strong>{selectedMood ? moodById(selectedMood.mood).label : '没有记录'}</strong><span>{selectedMood ? `${entryWeatherTitle(planet, selectedMood)} · 强度 ${selectedMood.intensity}/5` : '这一天是空白，也可以静静留着。'}</span></div></div>}
    {view === 'week' && <div className="almanac-week" role="group" aria-label="一周的记录">{weekDays.map((key, index) => <button key={key} type="button" disabled={key > today} className={selectedDate === key ? 'is-selected' : ''} onClick={() => setSelectedDate(key)} aria-label={`${readableDate(key)}，${latestFor(key) ? moodById(latestFor(key)!.mood).label : '未记录'}`}><small>{'一二三四五六日'[index]}</small><MoodRing entry={latestFor(key)} size={38} /><b>{Number(key.slice(-2))}</b></button>)}</div>}
    {view === 'month' && <div className="almanac-month"><div className="almanac-weekdays">{'一二三四五六日'.split('').map((day) => <span key={day}>{day}</span>)}</div><div className="almanac-month-grid">{monthCells.map((day, index) => day < 1 || day > monthLength ? <span key={`empty-${index}`} /> : (() => { const key = localKey(new Date(year, month.getMonth(), day)); return <button type="button" key={key} disabled={key > today} className={selectedDate === key ? 'is-selected' : ''} onClick={() => setSelectedDate(key)} aria-label={`${readableDate(key)}，${latestFor(key) ? moodById(latestFor(key)!.mood).label : '未记录'}`}><MoodRing entry={latestFor(key)} size={33} /><small>{day}</small></button> })())}</div></div>}
    {view === 'year' && <div className="almanac-year">{Array.from({ length: 12 }, (_, index) => { const key = localKey(new Date(year, index, 1)); const monthRecords = planetEntries.filter((entry) => entry.date.startsWith(key.slice(0, 7))); return <button type="button" key={key} disabled={key.slice(0, 7) > today.slice(0, 7)} onClick={() => { setSelectedDate(monthRecords[0]?.date ?? key); setView('month') }}><MoodRing entry={monthRecords[0]} size={42} /><strong>{index + 1} 月</strong><small>{monthRecords.length ? `${new Set(monthRecords.map((entry) => entry.date)).size} 天记录` : '尚未记录'}</small></button> })}</div>}
    <section className="almanac-detail" aria-label="选中日期的记录"><div className="section-label"><span>{readableDate(selectedDate)}</span><small>{selectedEntries.length} 条记录</small></div>{selectedEntries.length ? selectedEntries.map((entry) => <article className="almanac-entry" key={entry.id} style={{ '--mood-color': moodById(entry.mood).color } as CSSProperties}><div className="almanac-entry-head"><MoodRing entry={entry} size={39} /><div><strong>{moodById(entry.mood).label} · 强度 {entry.intensity}/5</strong><small>当天记录 · {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></div>{!readOnly && selectedDate === today && <button type="button" onClick={() => onEdit(entry)}>编辑</button>}</div><dl><div><dt>天气</dt><dd>{entryWeatherTitle(planet, entry)}</dd></div><div><dt>触发因素</dt><dd>{entry.triggers.length ? entry.triggers.join('、') : '未填写'}</dd></div><div><dt>给自己的话</dt><dd>{entry.privateNote || '未填写'}</dd></div><div><dt>告示</dt><dd>{entry.publicMessage || '未填写'}</dd></div><div><dt>隐私</dt><dd>{entry.privacy === 'private' ? '仅自己' : entry.privacy === 'mood_theme_public' ? '公开主线与心情' : '公开告示牌'}</dd></div></dl>{entry.doodle.length > 0 && <DoodlePreview strokes={entry.doodle} />}{entry.musicUrl && /^https?:\/\/music\.163\.com\//i.test(entry.musicUrl) && <a className="almanac-music" href={entry.musicUrl} target="_blank" rel="noreferrer"><Icon name="music" size={14} /> 打开当天的音乐 <Icon name="arrow" size={12} /></a>}</article>) : <p className="empty-history">这一天没有记录。</p>}{!readOnly && selectedDate === today && <button className="secondary-button almanac-add" type="button" disabled={selectedEntries.length > 0} onClick={onAddToday}><Icon name="plus" size={14} /> {selectedEntries.length ? '今日已记录' : '写下今天'}</button>}</section>
  </aside>
}

function SettingsPanel({ planets, currentId, onClose, onOpenAlmanac }: { planets: Planet[]; currentId?: string; onClose: () => void; onOpenAlmanac: (planet: Planet) => void }) {
  const updatePlanet = useAppStore((state) => state.updatePlanet)
  const updateFocusedThemes = useAppStore((state) => state.updateFocusedThemes)
  const focusedThemes = useAppStore((state) => state.focusedThemes)
  const serverAvailable = useAppStore((state) => state.serverAvailable)
  const setPlanetArchived = useAppStore((state) => state.setPlanetArchived)
  const active = planets.filter((planet) => !planet.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const archived = planets.filter((planet) => Boolean(planet.archivedAt)).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  const [selectedId, setSelectedId] = useState(currentId ?? active[0]?.id ?? archived[0]?.id)
  const selected = planets.find((planet) => planet.id === selectedId)
  const [name, setName] = useState(selected?.alias ?? '')
  const [tagline, setTagline] = useState(selected?.tagline ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [themeDraft, setThemeDraft] = useState<ThemeId[]>(focusedThemes)
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeMessage, setThemeMessage] = useState('')
  useEffect(() => { setName(selected?.alias ?? ''); setTagline(selected?.tagline ?? ''); setMessage(''); setConfirmArchive(false) }, [selected?.id, selected?.alias, selected?.tagline])
  useEffect(() => { setThemeDraft(focusedThemes); setThemeMessage('') }, [focusedThemes])
  const toggleFocusedTheme = (theme: ThemeId) => {
    setThemeMessage('')
    if (themeDraft.includes(theme)) setThemeDraft(themeDraft.filter((item) => item !== theme))
    else if (themeDraft.length >= 6) setThemeMessage('最多关注六条主线，请先取消一项再添加。')
    else setThemeDraft([...themeDraft, theme])
  }
  const saveFocusedThemes = async () => {
    if (themeBusy || themeDraft.length > 6) return
    setThemeBusy(true); setThemeMessage('')
    const result = await updateFocusedThemes(themeDraft)
    setThemeMessage(result.ok
      ? result.localOnly ? '已保存在此设备，暂未同步到账号。' : '关注主题已保存。'
      : result.error || '保存失败，请重试。')
    setThemeBusy(false)
  }
  const saveMetadata = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || busy) return
    if (!name.trim()) { setMessage('星球名字不能为空。'); return }
    setBusy(true); setMessage('')
    const result = await updatePlanet(selected.id, { alias: name.trim(), tagline: tagline.trim() })
    setMessage(result.ok ? '名称与标语已保存。' : result.error || '保存失败，请重试。'); setBusy(false)
  }
  const changeArchive = async (planet: Planet, archive: boolean) => {
    if (busy) return
    setBusy(true); setMessage('')
    const result = await setPlanetArchived(planet.id, archive)
    setMessage(result.ok ? archive ? '星球已归档，记录和年鉴仍在。' : '星球已恢复。' : result.error || '操作失败，请重试。')
    setConfirmArchive(false); setBusy(false)
  }
  return <aside className="drawer settings-drawer" aria-label="全局设置"><div className="drawer-top"><div><span className="drawer-kicker"><i className="teal-dot" /> MOODVERSE · SETTINGS</span><h2>设置</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭设置"><Icon name="close" /></button></div><p className="drawer-lede">管理宇宙里关注的星系，以及自己的星球与记录。</p>
    <section className="settings-group settings-focus-group" aria-labelledby="focused-themes-title"><div className="section-label"><span id="focused-themes-title">关注的主线</span><small>{themeDraft.length} / 6</small></div><p className="settings-focus-note">只影响宇宙中显示哪些星系；与你自己的星球主题完全独立，可以重复。</p><div className="settings-theme-grid">{THEMES.map((theme) => { const selected = themeDraft.includes(theme.id); return <button type="button" key={theme.id} className={`settings-theme-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} aria-label={`${theme.label}${selected ? '，已关注' : ''}`} title={theme.description} disabled={themeBusy} onClick={() => toggleFocusedTheme(theme.id)} style={{ '--theme': theme.color, '--theme-glow': theme.glow } as CSSProperties}><i>{selected ? '✓' : theme.glyph}</i><span>{theme.label}</span></button> })}</div><div className="settings-focus-footer"><span>{themeDraft.length ? `宇宙中将显示 ${themeDraft.length} 个星系` : '未关注主题时，宇宙中不显示他人的星系'}</span><div><button className="text-button" type="button" disabled={themeBusy || themeDraft.length === 6 && themeDraft.every((theme, index) => theme === THEMES[index]?.id)} onClick={() => { setThemeDraft(THEMES.slice(0, 6).map((theme) => theme.id)); setThemeMessage('') }}>恢复默认</button><button className="secondary-button" type="button" disabled={themeBusy || themeDraft.length === focusedThemes.length && themeDraft.every((theme, index) => theme === focusedThemes[index])} onClick={() => void saveFocusedThemes()}>{themeBusy ? '保存中…' : '保存关注主题'}</button></div></div>{themeMessage && <p className={`settings-message${serverAvailable === false && themeMessage.includes('此设备') ? ' is-local' : ''}`} role="status">{themeMessage}</p>}</section>
    <section className="settings-group"><div className="section-label"><span>活跃星球</span><small>{active.length} / 6</small></div><div className="settings-planet-list">{active.length ? active.map((planet) => <button type="button" key={planet.id} className={selectedId === planet.id ? 'is-selected' : ''} onClick={() => setSelectedId(planet.id)}><i style={{ background: themeById(planet.theme).color, boxShadow: `0 0 10px ${themeById(planet.theme).glow}` }} /><span>{planet.alias}<small>{themeById(planet.theme).label}</small></span><Icon name="arrow" size={13} /></button>) : <p className="settings-empty">没有活跃星球。去胚体写下第一天，就会在这里出现。</p>}</div></section>
    <section className="settings-group"><div className="section-label"><span>已归档</span><small>{archived.length}</small></div><div className="settings-planet-list">{archived.length ? archived.map((planet) => <button type="button" key={planet.id} className={selectedId === planet.id ? 'is-selected' : ''} onClick={() => setSelectedId(planet.id)}><i className="is-archived" style={{ background: themeById(planet.theme).color }} /><span>{planet.alias}<small>{themeById(planet.theme).label} · 已尘封</small></span><Icon name="arrow" size={13} /></button>) : <p className="settings-empty">还没有归档的星球。</p>}</div></section>
    {selected && <section className="settings-editor" aria-label={`${selected.alias}的设置`}><div className="section-label"><span>{selected.archivedAt ? '已归档星球' : '星球资料'}</span><small>{themeById(selected.theme).label} · 主题固定</small></div><form onSubmit={saveMetadata}><div className="field-group"><label htmlFor="settings-name">名字</label><input className="text-field" id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required /></div><div className="field-group"><label htmlFor="settings-tagline">标语</label><input className="text-field" id="settings-tagline" value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={100} placeholder="可以留空" /></div><button className="secondary-button" type="submit" disabled={busy}>保存资料</button></form><div className="settings-archive-actions"><button className="text-button" type="button" onClick={() => onOpenAlmanac(selected)}><Icon name="history" size={14} /> 查看星球年鉴</button>{selected.archivedAt ? <><button className="secondary-button" type="button" disabled={busy || active.length >= 6 || active.some((planet) => planet.theme === selected.theme)} onClick={() => void changeArchive(selected, false)}>恢复星球</button>{active.length >= 6 && <p className="settings-conflict">六颗活跃星球已满。请先归档一颗，再恢复这颗星球。</p>}{active.some((planet) => planet.theme === selected.theme) && <p className="settings-conflict">已有一颗活跃的「{themeById(selected.theme).label}」星球。请先归档它，再恢复这颗星球。</p>}</> : confirmArchive ? <div className="settings-confirm"><span>归档后，这颗星球会退出日常切换和公开宇宙。</span><button type="button" onClick={() => void changeArchive(selected, true)} disabled={busy}>确认归档</button><button type="button" onClick={() => setConfirmArchive(false)}>取消</button></div> : <button className="text-button settings-archive-button" type="button" onClick={() => setConfirmArchive(true)}>归档这颗星球</button>}</div></section>}
    {message && <p className="settings-message" role="status">{message}</p>}
  </aside>
}

async function fileToStarTexture(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择一张图片。')
  if (file.size > 12 * 1024 * 1024) throw new Error('原图不能超过 12 MB。')
  const bitmap = await createImageBitmap(file)
  try {
    const sourceRatio = bitmap.width / bitmap.height
    const cropWidth = sourceRatio > 2 ? bitmap.height * 2 : bitmap.width
    const cropHeight = sourceRatio > 2 ? bitmap.height : bitmap.width / 2
    const sx = (bitmap.width - cropWidth) / 2
    const sy = (bitmap.height - cropHeight) / 2
    for (const width of [512, 384, 256]) {
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = width / 2
      const context = canvas.getContext('2d')
      if (!context) continue
      context.drawImage(bitmap, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
      for (const quality of [.78, .65, .52, .42]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
        if (!blob || blob.type !== 'image/webp' || blob.size > 128 * 1024) continue
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败。'))
          reader.onerror = () => reject(new Error('图片读取失败。'))
          reader.readAsDataURL(blob)
        })
      }
    }
  } finally {
    bitmap.close()
  }
  throw new Error('图片压缩后仍然太大，请换一张简单一些的图片。')
}

const STAR_SWATCHES = [
  { color: '#ffd166', label: '暖金' }, { color: '#fff1c2', label: '月白' },
  { color: '#a8d8ff', label: '冰蓝' }, { color: '#ffad8b', label: '珊瑚' },
  { color: '#d0b4ff', label: '薰紫' }, { color: '#9ce8ce', label: '薄荷' },
]

function StarAppearancePanel({ appearance, onClose }: { appearance: StarAppearance; onClose: () => void }) {
  const updateStarAppearance = useAppStore((state) => state.updateStarAppearance)
  const serverAvailable = useAppStore((state) => state.serverAvailable)
  const [draft, setDraft] = useState<StarAppearance>(appearance)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => setDraft(appearance), [appearance])
  const chooseImage = async (file?: File) => {
    if (!file) return
    setError(''); setMessage('')
    try { const texture = await fileToStarTexture(file); setDraft((current) => ({ ...current, texture })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '图片处理失败，请重试。') }
  }
  const save = async () => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    const result = await updateStarAppearance(draft)
    if (result.ok) setMessage(result.localOnly ? '已保存在此设备，暂未同步到账号。' : '恒星外观已保存。')
    else setError(result.error ?? '保存失败，请重试。')
    setBusy(false)
  }
  return <aside className="drawer star-appearance-drawer" aria-label="恒星外观设置">
    <div className="drawer-top"><div><span className="drawer-kicker"><i className="copper-dot" /> MY GALAXY · STARLIGHT</span><h2>恒星的光</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭恒星外观设置"><Icon name="close" /></button></div>
    <p className="drawer-lede">给自己的星系选一种恒星颜色，也可以上传一张图片作为表面贴图。</p>
    <div className="star-appearance-preview" style={{ '--star-color': draft.color, backgroundImage: draft.texture ? `linear-gradient(#06101855,#06101855), url("${draft.texture}")` : undefined } as CSSProperties} role="img" aria-label={draft.texture ? '恒星贴图预览' : '恒星颜色预览'}><span style={{ backgroundColor: draft.color }} /></div>
    <section className="field-group"><label>恒星颜色</label><div className="star-color-grid" role="group" aria-label="选择恒星颜色">{STAR_SWATCHES.map((swatch) => <button type="button" key={swatch.color} className={draft.color === swatch.color ? 'is-selected' : ''} onClick={() => { setDraft((current) => ({ ...current, color: swatch.color })); setMessage(''); setError('') }} aria-label={swatch.label} aria-pressed={draft.color === swatch.color} title={swatch.label} style={{ '--star-color': swatch.color } as CSSProperties}><i /></button>)}</div></section>
    <section className="field-group"><label htmlFor="star-texture">恒星表面贴图 <small>图片会裁成 2:1 并压缩保存</small></label><input className="star-file-input" id="star-texture" type="file" accept="image/*" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.currentTarget.value = '' }} /><div className="star-texture-actions"><label className="secondary-button" htmlFor="star-texture">上传图片</label>{draft.texture && <button className="text-button" type="button" onClick={() => setDraft((current) => ({ ...current, texture: undefined }))}>移除贴图</button>}</div></section>
    <p className="star-appearance-note">贴图最多 128 KB；恒星外观会与当前匿名会话一起保存。{serverAvailable === false ? ' 当前离线模式只保存在这台设备。' : ''}</p>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className={`settings-message${serverAvailable === false ? ' is-local' : ''}`} role="status">{message}</p>}
    <button className="primary-button full-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存恒星外观'} <span>↗</span></button>
  </aside>
}

function CarePanel({ cards, onClose, onPublish }: { cards: ReturnType<typeof useAppStore.getState>['careCards']; onClose: () => void; onPublish: (id: string) => void }) {
  const card = cards[0]
  return <aside className="drawer care-drawer" aria-label="星球关怀建议"><div className="drawer-top"><div><span className="drawer-kicker"><i className="copper-dot" /> CARE SIGNAL · MOOD MATCH</span><h2>今天的一份关怀</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭关怀建议"><Icon name="close" /></button></div>{card ? <><div className="care-card-large"><div className="care-card-icon"><Icon name="spark" size={19} /></div><p className="care-title">{card.title}</p><p>{card.message}</p><div className="care-action"><span>现在可以试试</span><b>{card.action}</b></div><small>这不是诊断，只是一项温柔的自助建议 · 保留至 {card.expiresAt.slice(5, 10).replace('-', '/')}</small></div><button className="secondary-button" onClick={() => onPublish(card.id)} disabled={card.published}>{card.published ? '已放到自己的告示牌' : '把这张牌放到星球上'}</button></> : <p className="empty-history">完成今天的天气记录后，这里会出现一份专属关怀建议。</p>}</aside>
}

function FallbackUniverse({ themes, onMine, onSelect, onSettings }: { themes: ThemeId[]; onMine: () => void; onSelect: (theme: ThemeId) => void; onSettings: () => void }) {
  return <section className="fallback-universe" aria-label="可访问的星系列表"><div className="fallback-head"><h2>继续探索宇宙。</h2><p>选择一个关注的生活主线，查看其中的星球。</p></div><div className="fallback-grid">{themes.map((id) => { const theme = themeById(id); return <button key={theme.id} onClick={() => onSelect(theme.id)}><i style={{ background: theme.color }} /> <span>{theme.label}</span><Icon name="arrow" size={14} /></button> })}{!themes.length && <button type="button" onClick={onSettings}>还没有关注主题，去设置中选择<Icon name="arrow" size={14} /></button>}</div><button className="primary-button" onClick={onMine}>前往自己的星系 <span>↗</span></button></section>
}

function FallbackGalaxy({ theme, planets, onSelect, onBack }: { theme: ThemeId; planets: Planet[]; onSelect: (planet: Planet) => void; onBack: () => void }) {
  const meta = themeById(theme)
  return <section className="fallback-universe fallback-galaxy" aria-label={`${meta.label}星球列表`}>
    <div className="fallback-head"><h2>{meta.short}</h2><p>点击星球，看看它愿意分享的天气。</p></div>
    <div className="fallback-grid">{planets.map((planet) => <button key={planet.id} onClick={() => onSelect(planet)}><i style={{ background: meta.color }} /><span>{planet.alias}</span><small>{moodById(planet.mood).label} · {planet.message}</small><Icon name="arrow" size={14} /></button>)}</div>
    <button className="text-button" onClick={onBack}><Icon name="back" size={14} /> 回到宇宙</button>
  </section>
}

function GalaxyPlanetList({ theme, planets, onSelect }: { theme: ThemeId; planets: Planet[]; onSelect: (planet: Planet) => void }) {
  const meta = themeById(theme)
  return <div className="galaxy-planets"><div className="galaxy-planets-head"><span className="galaxy-planet-count" style={{ color: meta.color }}>{planets.length} 颗星球</span></div>{planets.map((planet) => <button key={planet.id} onClick={() => onSelect(planet)}><span className="planet-mini" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.glow}` }} /><span><b>{planet.alias}</b><small>{moodById(planet.mood).glyph} {moodById(planet.mood).label} · {planet.message}</small></span><Icon name="arrow" size={13} /></button>)}</div>
}

function GalaxyReturnFooter({ theme, label, color, glow, onBack }: { theme: ThemeId; label?: string; color?: string; glow?: string; onBack: () => void }) {
  const meta = themeById(theme)
  const galaxyLabel = label ?? meta.label
  return <div className="galaxy-footer" style={{ '--theme': color ?? meta.color, '--theme-glow': glow ?? meta.glow } as CSSProperties}>
    <div className="galaxy-theme-label" role="status" aria-label={`当前星系：${galaxyLabel}`}>星系 · {galaxyLabel}</div>
    <button className="galaxy-return-button" type="button" onClick={onBack}><Icon name="back" size={13} /> 回到宇宙</button>
  </div>
}

function OwnGalaxyPlanetList({ planets, currentId, onSelect, onCreate }: { planets: Planet[]; currentId?: string; onSelect: (planet: Planet) => void; onCreate: () => void }) {
  const slots = Array.from({ length: 6 }, (_, index) => planets[index])
  return <nav className="galaxy-planets own-galaxy-planets" aria-label="自己的星系中的星球">
    <div className="galaxy-planets-head"><span className="galaxy-planet-count">{planets.length} 颗星球</span></div>
    {slots.map((planet, index) => {
      if (!planet) return <button type="button" key={`embryo-${index}`} className="own-galaxy-slot is-embryo" onClick={onCreate} aria-label={`创建第 ${index + 1} 颗星球`}><span className="planet-mini" /><span><b>星球胚体</b><small>空轨道 · 点击写下第一天</small></span><Icon name="plus" size={13} /></button>
      const theme = themeById(planet.theme)
      const mood = moodById(planet.mood)
      return <button type="button" key={planet.id} className={`own-galaxy-slot${planet.id === currentId ? ' is-current' : ''}`} onClick={() => onSelect(planet)} style={{ '--slot-theme': theme.color, '--slot-glow': theme.glow } as CSSProperties} aria-current={planet.id === currentId ? 'true' : undefined}><span className="planet-mini" /><span><b>{planet.alias}</b><small>{theme.label} · {mood.glyph} {mood.label}</small></span><Icon name="arrow" size={13} /></button>
    })}
  </nav>
}

function JourneyPlanetAvatar({ color, themeId, id }: { color?: string; themeId?: ThemeId; id: string }) {
  const avatarColor = color ?? (themeId ? themeById(themeId).color : '#ffd166')
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '') || 'planet'
  const gradientId = `journey-planet-${safeId}`
  const clipId = `journey-planet-clip-${safeId}`
  return <svg className="journey-planet-avatar" viewBox="0 0 36 36" aria-hidden="true">
    <defs>
      <radialGradient id={gradientId} cx="28%" cy="24%" r="78%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity=".92" />
        <stop offset="34%" stopColor={avatarColor} />
        <stop offset="100%" stopColor={avatarColor} />
      </radialGradient>
      <clipPath id={clipId}><circle cx="18" cy="18" r="10.8" /></clipPath>
    </defs>
    <ellipse cx="18" cy="31.2" rx="8.5" ry="1.8" fill="#00040a" opacity=".7" />
    <ellipse className="journey-avatar-orbit" cx="18" cy="19" rx="15" ry="5.2" transform="rotate(-24 18 19)" />
    <circle cx="18" cy="18" r="10.8" fill={`url(#${gradientId})`} stroke="#fff" strokeOpacity=".72" strokeWidth=".8" />
    <g clipPath={`url(#${clipId})`}>
      <path d="M7.3 17.2 10.1 14l3.4.1 1.8-2 3.1.9 1.8 2.5 3.4.2 1.3 2.2-2.4 1.5-1.5 2.3-3.7.3-2.1 2.4-3.2-.8-.8-2.7-3.2-.8z" fill="#ecfff5" opacity=".36" />
      <path d="M20.2 25.1 22 23l2.7.4 1.5 2.1-1.7 2.2-3.1-.2z" fill="#fff" opacity=".2" />
    </g>
    <circle cx="14.7" cy="18.8" r=".9" fill="#14202c" />
    <circle cx="21.3" cy="18.8" r=".9" fill="#14202c" />
    <circle cx="12.4" cy="21.2" r="1.1" fill="#ff9fb9" opacity=".7" />
    <circle cx="23.6" cy="21.2" r="1.1" fill="#ff9fb9" opacity=".7" />
    <path d="M15.4 22.1q2.6 2.4 5.2 0" fill="none" stroke="#14202c" strokeWidth=".9" strokeLinecap="round" />
    <path d="m29 5 .7 1.8 1.8.7-1.8.7L29 10l-.7-1.8-1.8-.7 1.8-.7z" fill="var(--theme)" />
  </svg>
}

function JourneyStatus({ progress, planet, themes, starColor }: { progress: number; planet?: Planet; themes: ThemeId[]; starColor: string }) {
  const state = advanceJourney(progress, 0)
  if (state.phase === 'self') return null
  const currentIndex = getCurrentTourAnchorIndex(state.tourProgress, themes.length)
  const trackProgress = state.phase === 'tour' ? getTourTrackProgress(state.tourProgress) : 1
  const selfTheme = themeById(planet?.theme ?? 'care')
  return <div className="journey-status" role="progressbar" aria-label="宇宙环游进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(trackProgress * 100)}>
    {state.phase === 'tour' && themes[currentIndex] && <div className="journey-status-top" style={{ '--theme': themeById(themes[currentIndex]).color } as CSSProperties}><span>正在观测 · {themeById(themes[currentIndex]).label}</span></div>}
    <div className="journey-track" style={{ '--tour-stop-width': `${100 / (1 + TOUR_OVERSHOOT)}%` } as CSSProperties}>
      <i style={{ transform: `scaleX(${trackProgress})` }} />
      <div className="journey-stops">{themes.map((id, index) => { const theme = themeById(id); return <b key={theme.id} className={hasReachedTourAnchor(state.tourProgress, index, themes.length) ? 'is-passed' : ''} style={{ '--theme': theme.color } as CSSProperties} /> })}</div>
      <span className="journey-self-node" role="img" aria-label={`我的星球 · ${selfTheme.label}`} title={`我的星球 · ${selfTheme.label}`} style={{ '--theme': starColor, '--glow': starColor } as CSSProperties}>
        <JourneyPlanetAvatar color={starColor} id="journey-self" />
      </span>
    </div>
  </div>
}

function OwnPlanetNavigator({ planets, currentId, onSelect }: { planets: Planet[]; currentId?: string; onSelect: (id?: string) => void }) {
  const slots: Array<{ id?: string; label: string; theme?: ThemeId }> = planets.map((planet) => ({ id: planet.id, label: planet.alias, theme: planet.theme }))
  if (planets.length < 6) slots.push({ label: '新星球胚体' })
  const currentIndex = currentId ? slots.findIndex((slot) => slot.id === currentId) : slots.length - 1
  const index = Math.max(0, currentIndex)
  return <nav className="own-nav" aria-label="切换自己的星球">
    <button className="own-nav-arrow" type="button" disabled={index <= 0} onClick={() => onSelect(slots[index - 1]?.id)}><Icon name="back" size={13} /> 上一颗</button>
    <div className="own-nav-nodes">{slots.map((slot, nodeIndex) => {
      const theme = slot.theme ? themeById(slot.theme) : undefined
      return <button key={slot.id ?? 'embryo'} type="button" title={slot.label} aria-label={slot.label} aria-current={nodeIndex === index ? 'step' : undefined}
        className={`${nodeIndex === index ? 'is-current' : ''}${slot.id ? '' : ' is-embryo'}`}
        style={{ '--node-color': theme?.color ?? 'var(--muted)', '--theme': theme?.color ?? 'var(--muted)', '--glow': theme?.glow ?? 'transparent' } as CSSProperties}
        onClick={() => onSelect(slot.id)}>
        {slot.id && slot.theme ? <JourneyPlanetAvatar themeId={slot.theme} id={slot.id} /> : <span aria-hidden="true">+</span>}
      </button>
    })}</div>
    <button className="own-nav-arrow" type="button" disabled={index >= slots.length - 1} onClick={() => onSelect(slots[index + 1]?.id)}>下一颗 <Icon name="arrow" size={13} /></button>
  </nav>
}

export default function App() {
  const view = useAppStore((state) => state.view)
  const focusedTheme = useAppStore((state) => state.focusedTheme)
  const focusedThemes = useAppStore((state) => state.focusedThemes)
  const selectedPlanetId = useAppStore((state) => state.selectedPlanetId)
  const panel = useAppStore((state) => state.panel)
  const portal = useAppStore((state) => state.portal)
  const planet = useAppStore((state) => state.planet)
  const starAppearance = useAppStore((state) => state.starAppearance)
  const planets = useAppStore((state) => state.planets)
  const activePlanetId = useAppStore((state) => state.activePlanetId)
  const entries = useAppStore((state) => state.entries)
  const hasRecordedToday = Boolean(planet && entries.some((entry) => entry.planetId === planet.id && entry.date === todayKey()))
  const careCards = useAppStore((state) => state.careCards)
  const replies = useAppStore((state) => state.replies)
  const remotePlanets = useAppStore((state) => state.remotePlanets)
  const publicPlanetStatus = useAppStore((state) => state.publicPlanetStatus)
  const hydrate = useAppStore((state) => state.hydrate)
  const loadPublicGalaxy = useAppStore((state) => state.loadPublicGalaxy)
  const loadPublicPlanet = useAppStore((state) => state.loadPublicPlanet)
  const setView = useAppStore((state) => state.setView)
  const setTheme = useAppStore((state) => state.setTheme)
  const setSelectedPlanet = useAppStore((state) => state.setSelectedPlanet)
  const setPanel = useAppStore((state) => state.setPanel)
  const setPortal = useAppStore((state) => state.setPortal)
  const selectOwnPlanet = useAppStore((state) => state.selectOwnPlanet)
  const addReply = useAppStore((state) => state.addReply)
  const publishCareCard = useAppStore((state) => state.publishCareCard)
  const deleteBillboard = useAppStore((state) => state.deleteBillboard)
  const [webgl, setWebgl] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [galaxyRotation, setGalaxyRotation] = useState(0)
  const [selectedBillboardId, setSelectedBillboardId] = useState<string>()
  const [isSelfReturning, setIsSelfReturning] = useState(false)
  const [ownPlanetGrowthToken, setOwnPlanetGrowthToken] = useState(0)
  const [almanacPlanetId, setAlmanacPlanetId] = useState<string>()
  const [almanacReturnsToSettings, setAlmanacReturnsToSettings] = useState(false)
  const [editingEntry, setEditingEntry] = useState<MoodEntry>()
  const [creatingPlanet, setCreatingPlanet] = useState(false)
  const galaxyRotationRef = useRef(0)
  const autoJourneyFrame = useRef<number | null>(null)
  const exitSelfRef = useRef<() => void>(() => {})
  const returnToGalaxyRef = useRef<() => void>(() => {})
  const switchOwnRef = useRef<(direction: -1 | 1) => void>(() => {})
  const switchPublicPlanetRef = useRef<(direction: -1 | 1) => void>(() => {})
  const isReturningSelfRef = useRef(false)
  const switchLockUntilRef = useRef(0)
  const wheelGestureRef = useRef({ value: 0, lastAt: 0 })
  const publicWheelGestureRef = useRef({ value: 0, lastAt: 0 })
  const publicPlanetLockUntilRef = useRef(0)
  useEffect(() => { const canvas = document.createElement('canvas'); setWebgl(Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))) }, [])
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => {
    if (view === 'planet' && selectedPlanetId && selectedPlanetId !== 'self') void loadPublicPlanet(selectedPlanetId)
  }, [loadPublicPlanet, selectedPlanetId, view])
  useEffect(() => {
    if (view === 'galaxy' && focusedTheme) void loadPublicGalaxy(focusedTheme)
  }, [focusedTheme, loadPublicGalaxy, view])
  useEffect(() => () => {
    if (autoJourneyFrame.current !== null) cancelAnimationFrame(autoJourneyFrame.current)
  }, [])
  const universePlanets = getVisiblePlanets(undefined, remotePlanets, focusedThemes)
  const publicPlanets = focusedTheme ? getVisiblePlanets(focusedTheme, remotePlanets, focusedThemes) : universePlanets
  const activePlanets = planets.filter((item) => !item.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const almanacPlanet = planets.find((item) => item.id === almanacPlanetId) ?? planet
  const selectedPlanet = selectedPlanetId === 'self' ? planet : publicPlanets.find((item) => item.id === selectedPlanetId)
  const toggleBillboardSelection = (id: string) => setSelectedBillboardId((current) => current === id ? undefined : id)
  const journeyState = advanceJourney(portal, 0)
  useEffect(() => {
    if (view === 'galaxy' && focusedTheme && !focusedThemes.includes(focusedTheme)) {
      setTheme(undefined)
      setSelectedPlanet(undefined)
      setView('universe')
    }
  }, [focusedTheme, focusedThemes, setSelectedPlanet, setTheme, setView, view])
  useEffect(() => { setSelectedBillboardId(undefined) }, [activePlanetId])
  useEffect(() => {
    if (view !== 'universe' || journeyState.phase !== 'portal' || isReturningSelfRef.current) return
    const state = useAppStore.getState()
    const target = earliestActivePlanetId(state.planets)
    if (target && state.activePlanetId !== target) state.selectOwnPlanet(target)
  }, [journeyState.phase, portal, view])
  useEffect(() => {
    if (!webgl && portal >= 0.999 && view === 'universe') setView('home-galaxy')
  }, [portal, setView, view, webgl])
  useEffect(() => {
    const listener = (event: globalThis.WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('.drawer, .legend, .self-hud, .galaxy-planets, .own-nav, .topbar')) return
      if ((view === 'galaxy' && focusedTheme) || view === 'home-galaxy') {
        if (!webgl || (event.target instanceof Element && event.target.closest('.scene-copy, .topbar'))) return
        const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
        const pixelDelta = event.deltaY * modeScale
        if (!Number.isFinite(pixelDelta) || pixelDelta === 0) return
        event.preventDefault()
        const rotationDelta = Math.max(-0.18, Math.min(0.18, pixelDelta * 0.00105))
        galaxyRotationRef.current += rotationDelta
        setGalaxyRotation(galaxyRotationRef.current)
        return
      }
      if (view === 'planet' && focusedTheme) {
        if (!webgl || (event.target instanceof Element && event.target.closest('.scene-copy, .topbar'))) return
        const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
        const delta = event.deltaY * modeScale
        if (!Number.isFinite(delta) || delta === 0) return
        event.preventDefault()
        if (Date.now() < publicPlanetLockUntilRef.current) return
        const now = Date.now()
        const previous = publicWheelGestureRef.current
        const value = now - previous.lastAt > 360 || Math.sign(previous.value) !== Math.sign(delta) ? delta : previous.value + delta
        publicWheelGestureRef.current = { value, lastAt: now }
        if (Math.abs(value) < 42) return
        publicWheelGestureRef.current.value = 0
        switchPublicPlanetRef.current(delta > 0 ? 1 : -1)
        return
      }
      if (view === 'self') {
        event.preventDefault()
        if (isReturningSelfRef.current || panel !== 'none' || Date.now() < switchLockUntilRef.current) return
        const state = useAppStore.getState()
        const ownPlanets = state.planets.filter((item) => !item.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
        const currentIndex = state.activePlanetId ? ownPlanets.findIndex((item) => item.id === state.activePlanetId) : ownPlanets.length
        const wheelAction = selfPlanetWheelAction(event.deltaY, currentIndex)
        if (wheelAction === 'ignore') return
        const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
        const delta = event.deltaY * modeScale
        if (!Number.isFinite(delta)) return
        const now = Date.now()
        const previous = wheelGestureRef.current
        const value = now - previous.lastAt > 360 || Math.sign(previous.value) !== Math.sign(delta) ? delta : previous.value + delta
        wheelGestureRef.current = { value, lastAt: now }
        if (Math.abs(value) < 42) return
        wheelGestureRef.current.value = 0
        if (wheelAction === 'exit') returnToGalaxyRef.current()
        else switchOwnRef.current(wheelAction === 'next' ? 1 : -1)
        return
      }
      if (view === 'planet' || view === 'galaxy') return
      event.preventDefault()
      const step = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight)
      if (!step) return
      if (autoJourneyFrame.current !== null) {
        cancelAnimationFrame(autoJourneyFrame.current)
        autoJourneyFrame.current = null
      }
      const current = useAppStore.getState().portal
      const next = advanceJourney(current, step)
      setPortal(next.progress)
    }
    window.addEventListener('wheel', listener, { passive: false })
    return () => window.removeEventListener('wheel', listener)
  }, [focusedTheme, panel, publicPlanets.length, setPortal, setView, view, webgl])
  useEffect(() => {
    if (view !== 'self') return
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape' && panel !== 'none') { setPanel('none'); return }
      if (panel !== 'none') return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); switchOwnRef.current(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); switchOwnRef.current(-1) }
      if (event.key === 'ArrowUp') { event.preventDefault(); returnToGalaxyRef.current() }
    }
    let touchStart: { x: number; y: number } | undefined
    const touchstart = (event: TouchEvent) => {
      if (panel !== 'none' || (event.target instanceof Element && event.target.closest('.drawer, .self-hud, .own-nav, .topbar'))) { touchStart = undefined; return }
      const touch = event.touches[0]; if (touch) touchStart = { x: touch.clientX, y: touch.clientY }
    }
    const touchend = (event: TouchEvent) => {
      if (!touchStart || panel !== 'none') return
      const touch = event.changedTouches[0]; if (!touch) return
      const dx = touch.clientX - touchStart.x; const dy = touch.clientY - touchStart.y
      touchStart = undefined
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return
      switchOwnRef.current(dx < 0 ? 1 : -1)
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('touchstart', touchstart, { passive: true })
    window.addEventListener('touchend', touchend, { passive: true })
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('touchstart', touchstart); window.removeEventListener('touchend', touchend) }
  }, [panel, setPanel, view])
  const stopAutoJourney = () => {
    if (autoJourneyFrame.current !== null) cancelAnimationFrame(autoJourneyFrame.current)
    autoJourneyFrame.current = null
  }
  const setGalaxyRotationTarget = (rotation: number) => {
    galaxyRotationRef.current = rotation
    setGalaxyRotation(rotation)
  }
  const resetGalaxyRotation = () => setGalaxyRotationTarget(0)
  const finishSelfReturn = () => { isReturningSelfRef.current = false; setIsSelfReturning(false); setView('universe'); setTheme(undefined); setSelectedPlanet(undefined); resetGalaxyRotation(); setPanel('none'); setPortal(0) }
  const returnFromSelf = () => {
    if (isReturningSelfRef.current) return
    isReturningSelfRef.current = true
    setIsSelfReturning(true)
    stopAutoJourney()
    setPanel('none')
    const start = useAppStore.getState().portal
    if (reducedMotion || start <= 0.001) {
      finishSelfReturn()
      return
    }
    const duration = start > PORTAL_START
      ? SELF_RETURN_CLOUD_DURATION_MS + SELF_RETURN_TOUR_DURATION_MS
      : SELF_RETURN_TOUR_DURATION_MS
    let startedAt: number | null = null
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const elapsed = now - startedAt
      setPortal(getSelfReturnJourneyProgress(start, elapsed))
      if (elapsed < duration) autoJourneyFrame.current = requestAnimationFrame(tick)
      else {
        autoJourneyFrame.current = null
        setPortal(0)
        finishSelfReturn()
      }
    }
    autoJourneyFrame.current = requestAnimationFrame(tick)
  }
  exitSelfRef.current = returnFromSelf
  const returnToOwnGalaxy = () => {
    if (view !== 'self') return
    stopAutoJourney()
    setSelectedPlanet(undefined)
    setSelectedBillboardId(undefined)
    setPanel('none')
    setView('home-galaxy')
  }
  returnToGalaxyRef.current = returnToOwnGalaxy
  const switchOwnPlanet = (id?: string) => {
    if (Date.now() < switchLockUntilRef.current) return
    const state = useAppStore.getState()
    if (state.activePlanetId === id) return
    const active = state.planets.filter((item) => !item.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    if (id && !active.some((item) => item.id === id)) return
    if (!id && active.length >= 6) return
    switchLockUntilRef.current = Date.now() + (reducedMotion ? 80 : 360)
    setSelectedBillboardId(undefined)
    selectOwnPlanet(id)
  }
  switchOwnRef.current = (direction) => {
    const state = useAppStore.getState()
    const active = state.planets.filter((item) => !item.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    const index = state.activePlanetId ? active.findIndex((item) => item.id === state.activePlanetId) : active.length
    const nextIndex = adjacentOwnPlanetIndex(index, direction, active.length)
    if (nextIndex === undefined) return
    switchOwnPlanet(active[nextIndex]?.id)
  }
  switchPublicPlanetRef.current = (direction) => {
    const currentIndex = publicPlanets.findIndex((item) => item.id === selectedPlanetId)
    const nextIndex = adjacentPlanetIndex(currentIndex, direction, publicPlanets.length)
    const next = nextIndex === undefined ? undefined : publicPlanets[nextIndex]
    if (!next || Date.now() < publicPlanetLockUntilRef.current) return
    publicPlanetLockUntilRef.current = Date.now() + (reducedMotion ? 90 : 360)
    setSelectedBillboardId(undefined)
    setSelectedPlanet(next.id)
    setPanel('none')
  }
  const goHome = () => {
    if (view === 'self') {
      returnToGalaxyRef.current()
      return
    }
    if (view === 'home-galaxy') {
      exitSelfRef.current()
      return
    }
    stopAutoJourney()
    setView('universe'); setTheme(undefined); setSelectedPlanet(undefined); resetGalaxyRotation(); setPanel('none'); setPortal(0)
  }
  const returnToTour = () => { stopAutoJourney(); setView('universe'); setTheme(undefined); setSelectedPlanet(undefined); resetGalaxyRotation(); setPanel('none') }
  const goMine = () => {
    if (view === 'self' || view === 'home-galaxy') return
    stopAutoJourney()
    const ownState = useAppStore.getState()
    const ownTarget = earliestActivePlanetId(ownState.planets)
    if (ownState.activePlanetId !== ownTarget) selectOwnPlanet(ownTarget)
    const storedProgress = useAppStore.getState().portal
    const focusedThemeIndex = focusedTheme ? focusedThemes.indexOf(focusedTheme) : -1
    const startingProgress = view !== 'universe' && focusedThemeIndex >= 0
      ? (focusedThemeIndex / Math.max(1, focusedThemes.length)) * TOUR_END
      : storedProgress
    setSelectedPlanet(undefined)
    setTheme(undefined)
    setPanel('none')
    if (!webgl) {
      setView('universe')
      const fallbackStart = useAppStore.getState().portal
      const fallbackDuration = reducedMotion ? 0 : 900
      if (!fallbackDuration || fallbackStart >= 1) {
        setPortal(1)
        setView('home-galaxy')
        return
      }
      let fallbackStartedAt: number | null = null
      const fallbackTick = (now: number) => {
        if (fallbackStartedAt === null) fallbackStartedAt = now
        const progress = Math.min(1, (now - fallbackStartedAt) / fallbackDuration)
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
        setPortal(fallbackStart + (1 - fallbackStart) * eased)
        if (progress < 1) autoJourneyFrame.current = requestAnimationFrame(fallbackTick)
        else {
          autoJourneyFrame.current = null
          setPortal(1)
          setView('home-galaxy')
        }
      }
      autoJourneyFrame.current = requestAnimationFrame(fallbackTick)
      return
    }
    setView('universe')
    const portalStart = Math.max(startingProgress, TOUR_END)
    const fullTourDuration = reducedMotion ? 620 : 2200
    const fullArrivalDuration = reducedMotion ? 210 : 750
    const tourDuration = Math.max(0, (TOUR_END - startingProgress) / TOUR_END * fullTourDuration)
    const arrivalDuration = Math.max(0, (1 - portalStart) / (1 - TOUR_END) * fullArrivalDuration)
    if (tourDuration + arrivalDuration === 0) {
      setPortal(1)
      setView('home-galaxy')
      return
    }
    let startedAt: number | null = null
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const elapsed = now - startedAt
      const progress = elapsed < tourDuration
        ? startingProgress + (TOUR_END - startingProgress) * (elapsed / tourDuration)
        : portalStart + (1 - portalStart) * Math.min(1, (elapsed - tourDuration) / arrivalDuration)
      setPortal(progress)
      autoJourneyFrame.current = progress < 1 ? requestAnimationFrame(tick) : null
    }
    autoJourneyFrame.current = requestAnimationFrame(tick)
  }
  const arriveSelf = () => { if (useAppStore.getState().portal >= .98) { setSelectedPlanet(undefined); setTheme(undefined); setView('home-galaxy') } }
  const openGalaxy = (theme: ThemeId) => { stopAutoJourney(); setSelectedBillboardId(undefined); setTheme(theme); setSelectedPlanet(undefined); resetGalaxyRotation(); setView('galaxy'); setPanel('none') }
  const openPlanet = (item: Planet, rotation = galaxyRotation) => { stopAutoJourney(); setSelectedBillboardId(undefined); setSelectedPlanet(item.id); setTheme(item.theme); setGalaxyRotationTarget(rotation); setView(item.owner ? 'self' : 'planet'); setPanel('none') }
  const openOwnPlanet = (item: Planet, rotation = galaxyRotation) => {
    stopAutoJourney()
    const state = useAppStore.getState()
    if (state.activePlanetId !== item.id) {
      selectOwnPlanet(item.id)
    }
    setGalaxyRotationTarget(rotation)
    switchLockUntilRef.current = Date.now() + (reducedMotion ? 80 : 360)
    setSelectedBillboardId(undefined); setSelectedPlanet(undefined); setTheme(undefined); setPanel('none'); setView('self')
  }
  const openOwnEmbryo = () => {
    stopAutoJourney()
    setCreatingPlanet(true); setEditingEntry(undefined); setSelectedBillboardId(undefined); setPanel('compose')
  }
  const openPublicBillboard = (item: Planet, billboardId: string, rotation: number) => {
    openPlanet(item, rotation)
    setSelectedBillboardId(billboardId)
  }
  const fallbackSelect = (theme: ThemeId) => { setTheme(theme); setView('galaxy') }
  const openAlmanac = (target: Planet, returnToSettings = false) => { setAlmanacPlanetId(target.id); setAlmanacReturnsToSettings(returnToSettings); setPanel('history') }
  const portalVeil = Math.sin(journeyState.portalProgress * Math.PI)
  return <div className={`app-shell view-${view} ${journeyState.phase === 'portal' ? 'is-travelling' : ''}`}>
    <div className="scene-canvas" style={{ filter: `blur(${portalVeil * 3.5}px)`, transform: 'none', opacity: 1 }} aria-hidden={view === 'self' ? 'true' : undefined}>{webgl ? <UniverseCanvas view={view} focusedTheme={focusedTheme} focusedThemes={focusedThemes} publicPlanets={universePlanets} ownPlanet={planet} ownPlanets={activePlanets} starAppearance={starAppearance} ownPlanetGrowthToken={ownPlanetGrowthToken} selectedPlanet={selectedPlanet} galaxyRotation={galaxyRotation} selfReturning={isSelfReturning} selectedBillboardId={selectedBillboardId} onBillboardClick={setSelectedBillboardId} onPublicBillboardClick={openPublicBillboard} journey={portal} reducedMotion={reducedMotion} onArriveSelf={arriveSelf} onThemeClick={openGalaxy} onPlanetClick={openPlanet} onOwnPlanetClick={openOwnPlanet} onOwnEmbryoClick={openOwnEmbryo} onStarClick={() => setPanel('star')} /> : null}</div>
    {!webgl && view === 'universe' && <FallbackUniverse themes={focusedThemes} onMine={goMine} onSelect={fallbackSelect} onSettings={() => setPanel('settings')} />}
    {!webgl && view === 'galaxy' && focusedTheme && <FallbackGalaxy theme={focusedTheme} planets={publicPlanets} onSelect={openPlanet} onBack={returnToTour} />}
    {!webgl && view === 'self' && <div className={`self-fallback-planet${planet ? '' : ' is-embryo'}`} style={{ '--planet-color': themeById(planet?.theme ?? 'care').color } as CSSProperties} role="img" aria-label={planet ? planet.alias : '半透明星球胚体'} />}
    {!webgl && view === 'home-galaxy' && <button className="fallback-own-star" type="button" onClick={() => setPanel('star')} style={{ '--star-color': starAppearance.color } as CSSProperties} aria-label="调整恒星外观">✦</button>}
    <PortalOverlay portal={journeyState.portalProgress} returning={isSelfReturning} />
    <TopBar onHome={goHome} onSettings={() => setPanel(panel === 'settings' ? 'none' : 'settings')} settingsOpen={panel === 'settings'} homeLabel={view === 'self' ? '回到自己的星系' : view === 'home-galaxy' ? '回到宇宙' : '回到 Moodverse 宇宙'} />
    <main className="content-layer"><SceneIntro view={view} focusedTheme={focusedTheme} focusedThemeCount={focusedThemes.length} hasPlanet={Boolean(planet)} hasRecordedToday={hasRecordedToday} onCompose={() => { setEditingEntry(undefined); setPanel('compose') }} onMine={goMine} />
      {view === 'universe' && <UniverseLegend themes={focusedThemes} onSelect={openGalaxy} onSettings={() => setPanel('settings')} />}
      {view === 'universe' && <JourneyStatus progress={portal} planet={planet} themes={focusedThemes} starColor={starAppearance.color} />}
      {view === 'galaxy' && focusedTheme && <GalaxyReturnFooter theme={focusedTheme} onBack={returnToTour} />}
      {view === 'home-galaxy' && <>
        <GalaxyReturnFooter theme={planet?.theme ?? 'care'} label="我的星系" color={starAppearance.color} glow={starAppearance.color} onBack={() => exitSelfRef.current()} />
        <OwnGalaxyPlanetList planets={activePlanets} currentId={activePlanetId} onSelect={openOwnPlanet} onCreate={openOwnEmbryo} />
      </>}
      {view === 'self' && <><div className="self-hud"><OwnPlanetInfo planet={planet} entries={entries} /><OwnBillboardList billboards={planetBillboards(planet)} selectedId={selectedBillboardId} onSelect={toggleBillboardSelection} onDelete={(id) => { deleteBillboard(id); setSelectedBillboardId((current) => current === id ? undefined : current) }} /><div className="self-actions">{planet && <button className="hud-button" onClick={() => openAlmanac(planet)}><Icon name="history" /> 星球年鉴</button>}{planet && <button className="hud-button" onClick={() => setPanel('care')}><Icon name="spark" /> 关怀告示</button>}<button className="hud-button" onClick={returnToOwnGalaxy}><Icon name="back" /> 回到自己的星系</button></div></div><OwnPlanetNavigator planets={activePlanets} currentId={activePlanetId} onSelect={switchOwnPlanet} /></>}
      {view === 'galaxy' && focusedTheme && <GalaxyPlanetList theme={focusedTheme} planets={publicPlanets} onSelect={openPlanet} />}
    </main>
    {view === 'planet' && selectedPlanet && <PlanetDetails planet={selectedPlanet} replies={replies[selectedPlanet.id] ?? []} billboardId={selectedBillboardId} detailStatus={publicPlanetStatus[selectedPlanet.id] ?? 'idle'} onReply={(text) => addReply(selectedPlanet.id, text)} onClose={() => { setSelectedPlanet(undefined); setPanel('none'); setView(focusedTheme ? 'galaxy' : 'universe') }} />}
    {panel === 'compose' && <ComposePanel key={editingEntry?.id ?? `${creatingPlanet ? 'new-planet' : planet?.id ?? 'first-day'}`} planet={creatingPlanet ? undefined : planet} forceFirstDay={creatingPlanet} takenThemes={activePlanets.map((item) => item.theme)} editingEntry={editingEntry} onClose={() => { setCreatingPlanet(false); setEditingEntry(undefined); setPanel('none') }} onSaved={(created) => { setCreatingPlanet(false); setEditingEntry(undefined); if (created) { switchLockUntilRef.current = Date.now() + (reducedMotion ? 80 : 2500); setOwnPlanetGrowthToken((value) => value + 1) } setPanel('care') }} />}
    {panel === 'history' && almanacPlanet && <HistoryPanel key={almanacPlanet.id} planet={almanacPlanet} entries={entries} readOnly={Boolean(almanacPlanet.archivedAt)} onClose={() => { setPanel(almanacReturnsToSettings ? 'settings' : 'none'); setAlmanacReturnsToSettings(false) }} onEdit={(entry) => { setEditingEntry(entry); setPanel('compose') }} onAddToday={() => { if (entries.some((entry) => entry.planetId === almanacPlanet.id && entry.date === todayKey())) return; setEditingEntry(undefined); setPanel('compose') }} />}
    {panel === 'care' && <CarePanel cards={careCards.filter((card) => card.planetId === planet?.id)} onClose={() => setPanel('none')} onPublish={(id) => { publishCareCard(id); setPanel('none') }} />}
    {panel === 'settings' && <SettingsPanel planets={planets} currentId={planet?.id} onClose={() => setPanel('none')} onOpenAlmanac={(target) => openAlmanac(target, true)} />}
    {panel === 'star' && <StarAppearancePanel appearance={starAppearance} onClose={() => setPanel('none')} />}
  </div>
}
