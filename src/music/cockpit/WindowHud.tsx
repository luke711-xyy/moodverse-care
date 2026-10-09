import { useEffect, useRef, useState } from 'react'
import type { GalaxyGroupBy } from '../../music-api'
import type { CockpitFlight } from './flight'
import type { CockpitState } from './state'
import { gaugeNeedleAngle } from './instruments'
import './window-hud.css'

export type WindowTelemetry = {
  ownerId: string | null
  systemCount: number | null
  sectorPosition: number
  grouping: GalaxyGroupBy
  sector: { id: string; label: string; index: number; visiblePlanets: number; totalPlanets: number } | null
  orbitRotation: number | null
  visitor: { id: string; name: string } | null
  targetName: string | null
}
type Props = {
  state: CockpitState
  connected: boolean
  signal: 'idle' | 'loading' | 'traveling' | 'error'
  heading?: number
  telemetry?: WindowTelemetry
  flight?: CockpitFlight | null
}
type FlightLog = { key: string; time: string; text: string }
const clock = (date: Date) => date.toLocaleTimeString('en-GB', { hour12: false })
const number = (value: number) => String(value).padStart(2, '0')
const destinations = { home: 'MY PLANET', galaxy: 'GALAXY', visitor: 'VISITOR PLANET' }

/** Read-only bridge instruments. Coordinates are virtual sector units, not
 * real-world coordinates; every count and flight percentage comes from the app.
 * History is bounded to this cockpit session, never sent to a server or stored. */
export function WindowHud({ state, connected, signal, heading = 0, telemetry, flight }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [logs, setLogs] = useState<FlightLog[]>([])
  const lastEvent = useRef('')
  const owner = useRef(telemetry?.ownerId)
  const previousFlight = useRef<CockpitFlight | null>(null)
  const travel = state.travel.status === 'idle' ? null : state.travel
  const traveling = Boolean(travel)
  const sector = telemetry?.sector
  const inGalaxy = state.exterior === 'galaxy'
  const location = inGalaxy ? sector?.label ?? 'GALAXY' : state.exterior === 'visitor' ? telemetry?.visitor?.name ?? 'VISITOR PLANET' : 'MY PLANET'
  const destination = flight ? telemetry?.targetName ?? destinations[flight.to] : travel ? destinations[travel.target] : location
  const percent = flight ? Math.floor(Math.max(0, Math.min(1, flight.progress)) * 100) : 0
  const holding = Boolean(flight && !flight.ready && flight.progress >= .5)
  const link = !connected ? 'CONNECTING' : traveling ? holding ? 'AWAITING SIGNAL' : 'IN TRANSIT' : signal === 'error' ? 'LINK FAULT' : signal === 'loading' ? 'SYNCING' : 'LINK LIVE'
  const eventKey = !connected ? 'connecting' : travel ? `flight:${travel.token}`
    : `${state.exterior}:${inGalaxy ? sector?.id ?? 'galaxy' : state.exterior === 'visitor' ? telemetry?.visitor?.id ?? 'visitor' : 'local'}:${signal}:${telemetry?.grouping}`
  const eventText = !connected ? 'link: establishing connection'
    : traveling ? `jump --to "${destination}"`
    : signal === 'error' ? 'link: interrupted; position retained'
    : signal === 'loading' ? 'scan: synchronizing star chart'
    : state.exterior === 'visitor' ? `visited "${location}"`
    : inGalaxy ? sector ? `observe "${location}"` : 'galaxy: star chart ready'
    : 'docked: my planet'
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setNow(new Date()) }, 1000)
    const refresh = () => setNow(new Date())
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  useEffect(() => {
    const changedAccount = owner.current !== telemetry?.ownerId
    if (changedAccount) { owner.current = telemetry?.ownerId; lastEvent.current = ''; previousFlight.current = null }
    if (lastEvent.current === eventKey) return
    const interrupted = !traveling && previousFlight.current && previousFlight.current.to !== state.exterior
    const text = interrupted ? 'jump interrupted; origin retained' : eventText
    lastEvent.current = eventKey
    previousFlight.current = flight ?? null
    setLogs(current => [...(changedAccount ? [] : current).slice(-4), { key: eventKey, time: clock(new Date()), text }])
  }, [eventKey, eventText, telemetry?.ownerId, traveling, state.exterior, flight?.token])
  const orbit = telemetry?.orbitRotation
  const yaw = orbit == null ? null : ((orbit * 180 / Math.PI) % 360 + 360) % 360
  const command = traveling ? `nebula --progress ${String(percent).padStart(3, '0')}%`
    : !connected ? 'link --connect' : signal === 'error' ? 'link --status degraded'
    : state.exterior === 'home' ? 'jump --galaxy' : 'jump --home'
  const hint = !connected ? 'CONNECTING · PLEASE STAND BY' : traveling ? holding ? 'HOLD · WAITING FOR DATA' : `EN ROUTE → ${destination}`
    : inGalaxy ? 'IN GALAXY · 跃迁回自己的星球' : state.exterior === 'home' ? 'AT HOME · 跃迁前往 Galaxy' : 'VISITING · 跃迁回自己的星球'
  return <div className="cockpit-window-hud" data-flight-hold={holding} data-link={signal}>
    <svg className="window-hud-grid" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      {[100,300,500,700,900].map(x => <path key={`x${x}`} d={`M${x} 0 Q${x + (x - 500) * .035} 300 ${x} 600`} />)}
      {[120,240,360,480].map(y => <path key={`y${y}`} d={`M0 ${y} Q500 ${y - 12} 1000 ${y}`} />)}
    </svg>
    <svg className="window-hud-reticle" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M4 20h8m16 0h8M20 4v8m0 16v8" />
    </svg>
    <header className="window-hud-top">
      <strong className="window-hud-brand">MOSIC</strong>
      <span className="window-hud-sector">{inGalaxy ? `SECTOR ${sector ? number(sector.index + 1) : '—'} / ${telemetry?.systemCount == null ? '—' : number(telemetry.systemCount)}` : destinations[state.exterior]}</span>
      <span className="window-hud-link" aria-live="polite"><i aria-hidden="true" />{link}</span>
      <time className="window-hud-clock" dateTime={now.toISOString()} aria-label="当前本地时间">{clock(now)}<small>LT</small></time>
    </header>
    <aside className="window-hud-navigation" aria-label="导航遥测">
      <div className="window-hud-instrument-label">NAV / SECTOR MAP</div>
      <svg className="window-hud-compass" viewBox="0 0 120 100" aria-hidden="true">
        <circle cx="60" cy="48" r="37" /><circle cx="60" cy="48" r="27" />
        <path d="M16 48h88M60 4v88" />
        {Array.from({length:12},(_,i) => <path key={i} d="M60 8v5" transform={`rotate(${i*30} 60 48)`} />)}
        <g className="window-hud-needle instrument-needle" style={{ transform: `rotate(${gaugeNeedleAngle(heading)}deg)` }}><path className="window-hud-course" d="M60 16 64 48 60 55 56 48Z" /><circle cx="60" cy="48" r="3" /></g>
        <text x="60" y="99" textAnchor="middle">{inGalaxy ? 'SECTOR VECTOR' : 'LOCAL LOCK'}</text>
      </svg>
      <dl>
        <div><dt>COORD / X</dt><dd>{inGalaxy && telemetry ? telemetry.sectorPosition.toFixed(3).padStart(7,'0') : 'LOCAL'}</dd></div>
        <div><dt>ORBIT / θ</dt><dd>{yaw == null ? '—' : `${yaw.toFixed(1)}°`}</dd></div>
        <div><dt>PLANETS</dt><dd>{inGalaxy ? sector ? `${number(sector.visiblePlanets)} / ${number(sector.totalPlanets)}` : '—' : connected ? '01' : '—'}</dd></div>
      </dl>
      <small className="window-hud-count-note">{inGalaxy ? 'VISIBLE / IN SECTOR' : 'LOCAL PLANET'}</small>
      <div className="window-hud-grouping">{inGalaxy ? `MAP BY ${telemetry?.grouping.toUpperCase() ?? 'GENRE'}` : state.exterior === 'visitor' ? 'VISITOR ORBIT' : 'HOME ORBIT'}</div>
    </aside>
    <aside className="window-hud-terminal" aria-label="航行日志">
      <div className="window-hud-instrument-label"><span>bash · bridge.log</span><span aria-hidden="true">─ □</span></div>
      <ol>{logs.map((log,index) => <li key={`${log.key}:${index}`}><time>{log.time}</time><span title={log.text}>{log.text}</span></li>)}</ol>
      <div className="window-hud-command"><span aria-hidden="true">$</span><span>{command}</span><i aria-hidden="true" /></div>
      {traveling && <div className="window-hud-flight-track" aria-hidden="true"><span style={{transform:`scaleX(${percent / 100})`}} /></div>}
      <p className="window-hud-hint">{hint}</p>
    </aside>
  </div>
}
