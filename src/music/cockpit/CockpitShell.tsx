import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { GalaxyGroupBy } from '../../music-api'
import { pageTerminal, type CockpitPage, type CockpitState } from './state'
import './cockpit.css'
import { DitherSurfaceDefinitions } from './surface'
import { CrtScreen } from './CrtScreen'

export type CockpitSignal = 'idle' | 'loading' | 'traveling' | 'error'
type Props = {
  state: CockpitState
  reducedMotion: boolean
  crtEnabled: boolean
  signal: CockpitSignal
  heading: number
  planetName: string
  scene: ReactNode
  children: ReactNode
  personalPreview?: ReactNode
  explorationPreview?: ReactNode
  windowNavigation?: ReactNode
  by: GalaxyGroupBy
  onClassify: (by: GalaxyGroupBy) => void
  onOpen: (page: CockpitPage) => void
  onOverview: () => void
  onBack: () => void
  onGalaxy: () => void
  onHome: () => void
  onCancelTravel?: () => void
  connected?: boolean
  classifying?: boolean
}
const personalPages: Array<[CockpitPage, string]> = [['planet', '我的星球'], ['orbit', 'Orbit'], ['moment', 'Moment']]
const explorationPages: Array<[CockpitPage, string]> = [['collision', '撞歌'], ['roam', '漫游'], ['bottles', '漂流瓶']]
const pageNames: Record<CockpitPage, string> = {
  planet: '我的星球', manage: '星球资料', appearance: '星球外观', moment: 'Moment', orbit: 'Orbit',
  collision: '撞歌', roam: '漫游', bottles: '漂流瓶', galaxy: 'Galaxy', visitor: '星球档案',
  preflight: '访问确认', settings: '设置', moderation: '举报审核',
}
const signalNames: Record<CockpitSignal, string> = { idle: '就绪', loading: '搜索中', traveling: '航行中', error: '暂不可用' }

function Gauge({ label, value, state }: { label: string; value: number; state?: string }) {
  const angle = -110 + Math.max(0, Math.min(1, value)) * 220
  return <div className="cockpit-gauge" role="img" aria-label={`${label}：${state ?? Math.round(value * 360) + '°'}`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="gauge-case" cx="60" cy="60" r="55" />
      <circle className="gauge-face" cx="60" cy="60" r="47" />
      {Array.from({ length: 13 }, (_, i) => {
        const a = (i * 220 / 12 - 200) * Math.PI / 180
        return <line key={i} className={i % 3 === 0 ? 'gauge-tick major' : 'gauge-tick'}
          x1={60 + Math.cos(a) * 39} y1={60 + Math.sin(a) * 39}
          x2={60 + Math.cos(a) * (i % 3 === 0 ? 31 : 35)} y2={60 + Math.sin(a) * (i % 3 === 0 ? 31 : 35)} />
      })}
      <g className="gauge-needle" style={{ transform: `rotate(${angle}deg)` }}><path d="M57 65 L60 22 L63 65 Z" /><circle cx="60" cy="60" r="5" /></g>
      <text x="60" y="87" textAnchor="middle">{label}</text>
    </svg>
  </div>
}

function Vent() { return <span className="cockpit-vent" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</span> }

function CaseDetails({ serial }: { serial: string }) {
  return <span className="case-details" aria-hidden="true"><span className="case-serial">{serial}</span>
    {['tl','tr','bl','br'].map(corner => <i key={corner} className={`case-screw screw-${corner}`} />)}
    <span className="case-wear" /><span className="case-seam" /></span>
}
function ConsoleDeck() {
  return <svg className="cockpit-deck" viewBox="0 0 1800 360" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="deck-metal" x2=".25" y2="1"><stop stopColor="#efd293" /><stop offset=".2" stopColor="#c6a971" /><stop offset=".55" stopColor="#8a744b" /><stop offset="1" stopColor="#302718" /></linearGradient>
      <linearGradient id="deck-ivory" x2="0" y2="1"><stop stopColor="#f5d99a" /><stop offset=".24" stopColor="#d0ac70" /><stop offset=".55" stopColor="#897048" /><stop offset="1" stopColor="#382b1a" /></linearGradient></defs>
    <path d="M0 0 Q200 50 420 116 L650 150 Q900 185 1150 150 L1380 116 Q1600 50 1800 0 L1800 360 L0 360Z" fill="url(#deck-metal)" stroke="#e2c085" strokeWidth="3" />
    <path d="M0 20 Q240 95 430 139 Q900 260 1370 139 Q1600 90 1800 20" fill="none" stroke="#050b10" strokeWidth="22" />
    <path d="M0 15 Q240 90 430 134 Q900 255 1370 134 Q1600 85 1800 15" fill="none" stroke="url(#deck-ivory)" strokeWidth="13" />
    <path d="M0 190 L420 238 Q900 355 1380 238 L1800 190 L1800 360 L0 360Z" fill="url(#deck-ivory)" stroke="#201c15" strokeWidth="7" />
    {[90,350,570,1230,1450,1710].map((x,i)=><g key={x} transform={`translate(${x} ${210+i%2*35})`}><path d="M-35 0 L35 0 L27 62 L-27 62Z" fill="#3b352a" stroke="#908470" strokeWidth="2" />{Array.from({length:5},(_,j)=><path key={j} d={`M-20 ${j*9+8} L20 ${j*9+8}`} stroke="#19150f" strokeWidth="4" />)}</g>)}
    <path d="M140 305 C190 194 330 198 490 275 S630 318 690 205 M1660 305 C1610 194 1470 198 1310 275 S1170 318 1110 205" fill="none" stroke="#010508" strokeWidth="16" />
    <path d="M140 302 C190 191 330 195 490 272 S630 315 690 202 M1660 302 C1610 191 1470 195 1310 272 S1170 315 1110 202" fill="none" stroke="#8c806b" strokeWidth="6" strokeDasharray="2 6" />
    {Array.from({length:16},(_,i)=><g key={i} transform={`translate(${30+i*116} 335)`}><circle r="6" fill="#070b0e" stroke="#685742" strokeWidth="2" /><path d="M-3 -2 L3 2" stroke="#bec0a8" /></g>)}
  </svg>
}

/** A persistent world behind two physical monitors; opening a channel is not a flight. */
export function CockpitShell(props: Props) {
  const focused = props.state.console.focus !== 'overview'
  const terminal = pageTerminal(props.state.console.page)
  const personal = terminal === 'personal'
  const traveling = props.state.travel.status !== 'idle'
  const region = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const overview = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(props.state.console.focus)
  const [retreating, setRetreating] = useState(false)
  const [typing, setTyping] = useState(false)
  const [pan, setPan] = useState<'personal' | 'exploration' | 'controls'>('personal')
  const activePersonal = props.state.channels.personal
  const activeExploration = props.state.channels.exploration
  const content = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<CockpitPage, number>())
  useLayoutEffect(() => {
    const el = content.current, page = props.state.console.page
    if (!el) return
    el.scrollTop = scrollPositions.current.get(page) ?? 0
    return () => { scrollPositions.current.set(page, el.scrollTop) }
  }, [props.state.console.page])
  const open = (page: CockpitPage, event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) trigger.current = event.currentTarget
    props.onOpen(page)
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    if (previousFocus.current !== props.state.console.focus) {
      if (focused) { setRetreating(false); region.current?.focus({ preventScroll: true }) }
      else {
        const target = trigger.current?.isConnected ? trigger.current : overview.current?.querySelector<HTMLButtonElement>('.cockpit-personal-monitor')
        target?.focus({ preventScroll: true })
        if (!props.reducedMotion) { setRetreating(true); timer = setTimeout(() => setRetreating(false), 450) }
      }
    }
    previousFocus.current = props.state.console.focus
    if (props.reducedMotion) setRetreating(false)
    return () => { if (timer) clearTimeout(timer) }
  }, [props.state.console.focus, focused, props.reducedMotion])
  useEffect(() => {
    if (focused && !region.current?.contains(document.activeElement)) region.current?.focus({ preventScroll: true })
  }, [props.state.console.page, focused])
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); props.onBack(); return }
    if (event.key !== 'Tab') return
    const controls = Array.from(region.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])
      .filter(el => !el.closest('[hidden], [inert]'))
    if (!controls.length) { event.preventDefault(); return }
    const first = controls[0], last = controls.at(-1)!
    if (event.shiftKey && (document.activeElement === first || document.activeElement === region.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  const signalValue = props.signal === 'idle' ? .7 : props.signal === 'loading' ? .4 : props.signal === 'traveling' ? .95 : .08
  return <div className={`cockpit${focused ? ' is-focused' : ''}${traveling ? ' is-in-flight' : ''}`}
    data-focus={props.state.console.focus} data-page={props.state.console.page} data-exterior={props.state.exterior}
    data-crt={props.crtEnabled ? 'on' : 'off'} data-crt-motion={props.crtEnabled && !props.reducedMotion} data-typing={typing} data-reduced-motion={props.reducedMotion}>
    <DitherSurfaceDefinitions />
    <div className="cockpit-window-frame" aria-hidden="true" />
    <div className="cockpit-viewport" inert={focused || undefined} aria-hidden={focused || undefined}>
      {props.scene}
      <div className="cockpit-window-nav">{props.windowNavigation}</div>
      <div className="cockpit-window-label" aria-live="polite">{props.connected === false ? '连接中' : traveling ? '穿过星云' : props.state.exterior === 'galaxy' ? props.signal === 'loading' ? 'Galaxy · 搜索中' : props.signal === 'error' ? 'Galaxy · 暂不可用' : 'Galaxy' : props.state.exterior === 'visitor' ? '访客星球' : props.planetName}</div>
      {traveling && props.onCancelTravel && <button className="cockpit-flight-cancel" onClick={props.onCancelTravel}>取消航行</button>}
    </div>
    <div className="cockpit-pan-nav" hidden={focused} aria-label="控制台区域">
      {(['personal', 'exploration', 'controls'] as const).map((zone, i) => <button key={zone} aria-pressed={pan === zone} onClick={() => {
        setPan(zone); document.getElementById(`cockpit-${zone}`)?.scrollIntoView({ behavior: props.reducedMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'center' })
      }}>{['个人', '探索', '控制'][i]}</button>)}
    </div>
    <div ref={overview} className="cockpit-console-scroll" inert={focused || undefined} aria-hidden={focused || undefined}>
      <ConsoleDeck />
      <div className="cockpit-console">
        <section id="cockpit-personal" className="cockpit-wing cockpit-wing-left">
          <CaseDetails serial="PERSONAL / 01" />
          <div className="cockpit-hardware-label">个人终端</div>
          <button className="cockpit-monitor cockpit-personal-monitor" aria-label="打开个人终端" disabled={traveling} onClick={event => open(activePersonal, event)}>
            <CrtScreen mini active={!focused} motion={!props.reducedMotion} enabled={props.crtEnabled}><span className="cockpit-monitor-content">{props.personalPreview ?? <span className="cockpit-mini-caption">{props.planetName}</span>}</span></CrtScreen>
            <span className="cockpit-monitor-channel">{pageNames[activePersonal]}</span>
          </button>
          <div className="cockpit-keys">{personalPages.map(([page, label]) => <button key={page} disabled={traveling} aria-pressed={personal && props.state.console.page === page} onClick={event => open(page, event)}>{label}</button>)}</div>
          <Vent />
        </section>
        <div className="cockpit-gauge-bay"><i className="cockpit-lamp" data-lit={props.connected !== false} /><Gauge label="航向" value={props.heading} /><button className="cockpit-flight-lever" disabled={traveling} aria-label={props.state.exterior === 'visitor' ? '返回出发地' : 'Galaxy'} onClick={event => props.state.exterior === 'visitor' ? props.onHome() : props.state.exterior === 'home' ? props.onGalaxy() : open('galaxy', event)}><span aria-hidden="true" /><small>{props.state.exterior === 'visitor' ? '返回' : 'Galaxy'}</small></button></div>
        <section id="cockpit-exploration" className="cockpit-center">
          <CaseDetails serial="TRANSMISSION / 02" />
          <div className="cockpit-hardware-label">探索终端 <span className="cockpit-signal" data-signal={props.signal}>{signalNames[props.signal]}</span></div>
          <button className="cockpit-monitor cockpit-exploration-monitor" aria-label="打开探索终端" disabled={traveling} onClick={event => open(activeExploration, event)}>
            <CrtScreen mini active={!focused} motion={!props.reducedMotion} enabled={props.crtEnabled}><span className="cockpit-monitor-content">{props.explorationPreview ?? <span className="cockpit-mini-caption">{signalNames[props.signal]}</span>}</span></CrtScreen>
            <span className="cockpit-monitor-channel">{pageNames[activeExploration]}</span>
          </button>
          <div className="cockpit-keys">{explorationPages.map(([page, label]) => <button key={page} disabled={traveling} aria-pressed={!personal && props.state.console.page === page} onClick={event => open(page, event)}>{label}</button>)}</div>
          <Vent />
        </section>
        <div className="cockpit-gauge-bay cockpit-signal-bay"><i className="cockpit-lamp" data-lit={props.signal !== 'error'} /><Gauge label="信号" value={signalValue} state={signalNames[props.signal]} /><span className="cockpit-signal-legend">{signalNames[props.signal]}</span></div>
        <section id="cockpit-controls" className="cockpit-wing cockpit-wing-right">
          <CaseDetails serial="NAVIGATION / 03" />
          <div className="cockpit-hardware-label">Galaxy 分类</div>
          <div className="cockpit-knob" role="group" aria-label="Galaxy 分类旋钮" style={{ '--knob-angle': `${props.by === 'song' ? -55 : props.by === 'artist' ? 0 : 55}deg` } as CSSProperties}>
            {(['song', 'artist', 'genre'] as const).map((by, i) => <button key={by} className={`cockpit-knob-label knob-${by}`} disabled={traveling || props.classifying} aria-pressed={props.by === by} onClick={() => props.onClassify(by)}>{['歌曲', '艺人', '曲风'][i]}</button>)}
            <span className="cockpit-knob-body" aria-hidden="true"><i /></span>
          </div>
          <button className="cockpit-settings-key" aria-label="设置" disabled={traveling} onClick={event => open('settings', event)}>⚙ <span>设置</span></button><Vent />
        </section>
      </div>
    </div>
    <div ref={region} className={`cockpit-terminal cockpit-${terminal}-terminal${retreating ? ' is-retreating' : ''}`} hidden={!focused && !retreating} aria-hidden={!focused || undefined} inert={!focused || undefined}
      role="region" tabIndex={-1} aria-label={personal ? '个人终端' : '探索终端'} data-page={props.state.console.page}
      onKeyDown={trapFocus} onFocusCapture={event => setTyping(['INPUT', 'TEXTAREA'].includes(event.target.tagName))}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTyping(false) }}>
      <header className="cockpit-terminal-header">
        <span className="cockpit-terminal-name">{personal ? '个人终端' : '探索终端'}</span>
        <nav aria-label={personal ? '个人频道' : '探索频道'}>{(personal ? personalPages : explorationPages).map(([page, label]) => <button key={page} aria-pressed={props.state.console.page === page} onClick={() => open(page)}>{label}</button>)}</nav>
        <button className="cockpit-terminal-settings" aria-label="设置" onClick={() => open('settings')}>⚙</button><i className="cockpit-lamp" data-lit="true" />
      </header>
      <div className="cockpit-terminal-glass"><CrtScreen active={focused} motion={!props.reducedMotion} enabled={props.crtEnabled}><div ref={content} className="cockpit-terminal-content">{props.children}</div></CrtScreen></div>
      <footer className="cockpit-terminal-footer"><button aria-label="返回驾驶舱" onClick={props.onOverview}>← 返回驾驶舱</button>{props.state.history.length > 1 && <button onClick={props.onBack}>← 返回</button>}<span>{pageNames[props.state.console.page]} <small>匿名体验账号</small></span></footer>
    </div>
  </div>
}
