import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { GalaxyGroupBy } from '../../music-api'
import { pageTerminal, type CockpitPage, type CockpitState } from './state'
import './cockpit.css'

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
    data-crt={props.crtEnabled && !props.reducedMotion ? 'on' : 'off'} data-typing={typing} data-reduced-motion={props.reducedMotion}>
    <div className="cockpit-window-frame" aria-hidden="true" />
    <div className="cockpit-viewport" inert={focused || undefined} aria-hidden={focused || undefined}>
      {props.scene}
      <div className="cockpit-window-nav">{props.windowNavigation}</div>
      <div className="cockpit-window-label" aria-live="polite">{props.connected === false ? '连接中' : traveling ? '穿过星云' : props.state.exterior === 'galaxy' ? 'Galaxy' : props.state.exterior === 'visitor' ? '访客星球' : props.planetName}</div>
      {traveling && props.onCancelTravel && <button className="cockpit-flight-cancel" onClick={props.onCancelTravel}>取消航行</button>}
    </div>
    <div className="cockpit-pan-nav" hidden={focused} aria-label="控制台区域">
      {(['personal', 'exploration', 'controls'] as const).map((zone, i) => <button key={zone} aria-pressed={pan === zone} onClick={() => {
        setPan(zone); document.getElementById(`cockpit-${zone}`)?.scrollIntoView({ behavior: props.reducedMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'center' })
      }}>{['个人', '探索', '控制'][i]}</button>)}
    </div>
    <div ref={overview} className="cockpit-console-scroll" inert={focused || undefined} aria-hidden={focused || undefined}>
      <div className="cockpit-console">
        <section id="cockpit-personal" className="cockpit-wing cockpit-wing-left">
          <div className="cockpit-hardware-label">个人终端</div>
          <button className="cockpit-monitor cockpit-personal-monitor" aria-label="打开个人终端" disabled={traveling} onClick={event => open(activePersonal, event)}>
            <span className="cockpit-monitor-content">{props.personalPreview ?? <span className="cockpit-mini-caption">{props.planetName}</span>}</span>
            <span className="cockpit-monitor-channel">{pageNames[activePersonal]}</span>
          </button>
          <div className="cockpit-keys">{personalPages.map(([page, label]) => <button key={page} disabled={traveling} aria-pressed={personal && props.state.console.page === page} onClick={event => open(page, event)}>{label}</button>)}</div>
          <Vent />
        </section>
        <div className="cockpit-gauge-bay"><i className="cockpit-lamp" data-lit={props.connected !== false} /><Gauge label="航向" value={props.heading} /><button className="cockpit-flight-lever" disabled={traveling} aria-label={props.state.exterior === 'home' ? 'Galaxy' : '回到我的星球'} onClick={props.state.exterior === 'home' ? props.onGalaxy : props.onHome}><span aria-hidden="true" /><small>{props.state.exterior === 'home' ? 'Galaxy' : '返回'}</small></button></div>
        <section id="cockpit-exploration" className="cockpit-center">
          <div className="cockpit-hardware-label">探索终端 <span className="cockpit-signal" data-signal={props.signal}>{signalNames[props.signal]}</span></div>
          <button className="cockpit-monitor cockpit-exploration-monitor" aria-label="打开探索终端" disabled={traveling} onClick={event => open(activeExploration, event)}>
            <span className="cockpit-monitor-content">{props.explorationPreview ?? <span className="cockpit-mini-caption">{signalNames[props.signal]}</span>}</span>
            <span className="cockpit-monitor-channel">{pageNames[activeExploration]}</span>
          </button>
          <div className="cockpit-keys">{explorationPages.map(([page, label]) => <button key={page} disabled={traveling} aria-pressed={!personal && props.state.console.page === page} onClick={event => open(page, event)}>{label}</button>)}</div>
          <Vent />
        </section>
        <div className="cockpit-gauge-bay cockpit-signal-bay"><i className="cockpit-lamp" data-lit={props.signal !== 'error'} /><Gauge label="信号" value={signalValue} state={signalNames[props.signal]} /><span className="cockpit-signal-legend">{signalNames[props.signal]}</span></div>
        <section id="cockpit-controls" className="cockpit-wing cockpit-wing-right">
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
      <div className="cockpit-terminal-glass"><div ref={content} className="cockpit-terminal-content">{props.children}</div></div>
      <footer className="cockpit-terminal-footer"><button aria-label="返回驾驶舱" onClick={props.onOverview}>← 返回驾驶舱</button>{props.state.history.length > 1 && <button onClick={props.onBack}>← 返回</button>}<span>{pageNames[props.state.console.page]} <small>匿名体验账号</small></span></footer>
    </div>
  </div>
}
