import type { CSSProperties } from 'react'
import type { GalaxyGroupBy } from '../../music-api'
import { DitherPlanetMark } from '../dither/components'
import './readouts.css'

const count = (value: number | null) => value === null ? '—' : String(Math.max(0, Math.floor(value))).padStart(2, '0')
const validNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0

function ShipFrame() {
  return <svg className="telemetry-ship" viewBox="0 0 144 108" role="img" aria-label="飞船框架示意图">
    <g className="ship-guides"><path d="M4 54H140M73 5V100" /><path d="M12 97H135M12 94V100M135 94V100" /></g>
    <g className="ship-frame">
      <path d="M29 40H45L53 34H67L75 41H116L135 45L140 54L135 63L116 67H75L67 74H53L45 68H29Z" />
      <rect x="13" y="42" width="16" height="24" rx="2" /><path d="M9 39V69M5 45V63M17 42V66M24 42V66M33 40V68" />
      <ellipse cx="60" cy="54" rx="12" ry="20" /><ellipse cx="60" cy="54" rx="5" ry="15" />
      <path d="M73 41L116 67M73 67L116 41M73 54H138M94 41V67M116 41V67M125 43V65" />
      <path d="M49 34V24H70V34M49 74V84H70V74" /><rect x="45" y="17" width="29" height="7" /><rect x="45" y="84" width="29" height="7" />
      <path d="M80 37H109M80 71H109M76 33V39M113 33V39M76 69V75M113 69V75" />
    </g>
    <g className="ship-registration"><text x="6" y="11">M / 01</text><text x="82" y="104">FRAME VIEW</text></g>
  </svg>
}

export function PersonalTelemetry({ planetName, planetId, visual, songs, moments, bpm, durationSeconds, trackTitle, requests = 0, context = 'personal' }: {
  planetName: string; planetId?: string | null; visual?: unknown; songs: number; moments: number | null; bpm?: number | null; durationSeconds?: number | null; trackTitle: string; requests?: number; context?: 'personal' | 'visitor'
}) {
  const length = validNumber(durationSeconds) ? `${Math.floor(durationSeconds! / 60)}:${String(Math.floor(durationSeconds! % 60)).padStart(2, '0')}` : '—'
  const metrics = [['SONGS', count(songs)], ['MOMENTS', count(moments)], ['BPM', validNumber(bpm) ? String(Math.round(bpm! * 10) / 10) : '—'], ['LENGTH', length]]
  return <span className="cockpit-personal-telemetry">
    <span className="telemetry-header"><span>{context === 'visitor' ? 'VISITOR / NAV' : 'PERSONAL / NAV'}</span><span>{context === 'visitor' ? 'PUBLIC LINK' : requests ? `${requests} REQUESTS` : 'LOCAL LINK'}</span></span>
    <span className="telemetry-identity">
      <strong className="telemetry-callsign" title={planetName}>{planetName}</strong>
      {planetId && !!visual && <span className="telemetry-planet-thumbnail" role="img" aria-label={`${planetName}的星球缩略图`}><DitherPlanetMark planetId={planetId} visual={visual} /></span>}
    </span>
    <span className="telemetry-body"><ShipFrame /><dl className="telemetry-metrics">{metrics.map(([label, value]) => <div key={label} data-metric={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></span>
    <span className="telemetry-audio" title={trackTitle}><span>AUDIO /</span> {trackTitle}</span>
  </span>
}

/** Uses the same chart snapshot as the windshield, including during regrouping. */
export function GalaxyTelemetry({ grouping, systemCount, sector, status }: {
  grouping: GalaxyGroupBy; systemCount: number | null; status: 'loading' | 'ready' | 'error'
  sector: { label: string; index: number; visiblePlanets: number; totalPlanets: number } | null
}) {
  const basis = { genre: '曲风', artist: '艺人', song: '歌曲' }[grouping]
  const name = sector?.label ?? (status === 'loading' ? '正在载入星系' : status === 'error' ? '星图暂不可用' : '暂无星系')
  const link = status === 'loading' ? 'SYNCING' : status === 'error' ? 'LINK FAULT' : sector ? 'SECTOR LINK' : 'NO SECTORS'
  const metrics = [
    ['MAP BY', basis, '当前星图分类依据'],
    ['SECTOR', systemCount === null ? '—' : `${sector ? count(sector.index + 1) : '—'}/${count(systemCount)}`, '当前星系 / 星系总数'],
    ['VISIBLE', count(sector?.visiblePlanets ?? null), '本区当前显示的星球数'],
    ['IN GROUP', count(sector?.totalPlanets ?? null), '该分类下的星球总数'],
  ]
  return <span className="cockpit-personal-telemetry cockpit-galaxy-telemetry">
    <span className="telemetry-header"><span>GALAXY / NAV</span><span>{link}</span></span>
    <span className="telemetry-identity"><strong className="telemetry-callsign" title={name}>{name}</strong></span>
    <span className="telemetry-body">
      <svg className="telemetry-ship" viewBox="0 0 144 108" role="img" aria-label="星系轨道示意图">
        <g className="ship-guides"><path d="M4 54H140M72 6V96" /><circle cx="72" cy="54" r="43" /></g>
        <g className="ship-frame">
          <circle cx="72" cy="54" r="8" /><path d="M72 42V46M72 62V66M60 54H64M80 54H84" />
          <ellipse cx="72" cy="54" rx="56" ry="24" />
          <ellipse cx="72" cy="54" rx="56" ry="24" transform="rotate(60 72 54)" />
          <ellipse cx="72" cy="54" rx="56" ry="24" transform="rotate(-60 72 54)" />
          <circle cx="128" cy="54" r="3" /><circle cx="44" cy="6" r="3" /><circle cx="44" cy="102" r="3" />
        </g>
        <g className="ship-registration"><text x="6" y="11">G / NAV</text><text x="83" y="104">ORBIT VIEW</text></g>
      </svg>
      <dl className="telemetry-metrics">{metrics.map(([label, value, description]) => <div key={label} data-metric={label} title={description}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </span>
    <span className="telemetry-audio" title={`按${basis}聚合星球；VISIBLE 为本区可见数量，IN GROUP 为分类总数`}><span>FILTER /</span> 按{basis}聚合</span>
  </span>
}

export type MapSignal = { planetId: string; displayName: string }
function hash(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0 }
function shortName(value: string) {
  let width = 0, result = ''
  for (const char of value) { width += /[^\u0000-\u00ff]/.test(char) ? 2 : 1; if (width > 14) return result + '…'; result += char }
  return result
}
/** Relative display coordinates, not geographic locations or match scores. */
export function signalMapLayout(signals: MapSignal[]) {
  const height = Math.max(104, Math.ceil(signals.length / 3) * 38 + 28)
  const nodes = signals.map((signal, index) => {
    const seed = hash(signal.planetId)
    return { ...signal, label: shortName(signal.displayName), x: 60 + index % 3 * 120 + seed % 13 - 6, y: 25 + Math.floor(index / 3) * 38 + seed % 7 }
  })
  return { height, nodes }
}

export function SignalMap({ signals, title, scanning, mode = 'SONG LINK' }: { signals: MapSignal[]; title: string; scanning: boolean; mode?: string }) {
  const { height, nodes } = signalMapLayout(signals), origin = { x: 180, y: height - 13 }
  return <span className="cockpit-radar-preview cockpit-signal-map" data-scanning={scanning} data-dense={signals.length > 9} style={{ '--chart-height': height } as CSSProperties}>
    <span className="signal-map-heading">{title}</span><small>{signals.length} SIGNALS</small>
    <svg className="signal-map-chart" viewBox={`0 0 360 ${height}`} role="img" aria-label={`信号坐标星图：${signals.length} 个信号${signals.length ? '，' + signals.map(signal => signal.displayName).join('、') : ''}`}>
      <g className="signal-chart-grid" aria-hidden="true">{[24,76,128,180,232,284,336].map(x => <path key={x} d={`M${x} 5V${height - 5}`} />)}{Array.from({length:Math.ceil(height / 26)},(_,i) => <path key={i} d={`M8 ${i * 26 + 8}H352`} />)}</g>
      <g className="signal-chart-range" aria-hidden="true"><circle cx={origin.x} cy={origin.y} r="82" /><circle cx={origin.x} cy={origin.y} r="40" /><path d={`M${origin.x - 94} ${origin.y}H${origin.x + 94}M${origin.x} ${origin.y - 94}V${origin.y + 5}`} /></g>
      <g className="signal-radar-sweep" style={{transformOrigin:`${origin.x}px ${origin.y}px`}} aria-hidden="true"><path d={`M${origin.x} ${origin.y}l-58 -58A82 82 0 0 1 ${origin.x + 32} ${origin.y - 75}Z`} /></g>
      <g className="signal-chart-links" aria-hidden="true">{nodes.map(node => <path key={node.planetId} d={`M${origin.x} ${origin.y}L${node.x} ${node.y}`} />)}</g>
      {nodes.map(node => <g key={node.planetId} data-signal-id={node.planetId} className="signal-chart-node" transform={`translate(${node.x} ${node.y})`}>
        <title>{node.displayName}</title><circle r="5" /><circle r="1.3" /><path d="M-8 0H-6M6 0H8M0 -8V-6M0 6V8" />
        <text className="signal-node-name" x="0" y="-11" textAnchor="middle">{node.label}</text><text className="signal-node-coordinate" x="0" y="17" textAnchor="middle">{`${node.x - 180 >= 0 ? '+' : ''}${node.x - 180} / ${origin.y - node.y}`}</text>
      </g>)}
      <g className="signal-chart-origin" aria-hidden="true"><circle cx={origin.x} cy={origin.y} r="3" /><path d={`M${origin.x - 6} ${origin.y}H${origin.x + 6}M${origin.x} ${origin.y - 6}V${origin.y + 6}`} /><text x={origin.x + 9} y={origin.y + 3}>SELF</text></g>
      {!nodes.length && <text className="signal-no-contacts" x="180" y="36" textAnchor="middle">{scanning ? 'ACQUIRING CONTACTS' : 'NO CONTACTS'}</text>}
      <path className="signal-chart-brackets" d={`M8 18V6H24M336 6H352V18M8 ${height - 18}V${height - 6}H24M336 ${height - 6}H352V${height - 18}`} aria-hidden="true" />
    </svg>
    <span className="signal-map-footer"><span>{mode}</span><span>RELATIVE CHART</span></span>
  </span>
}
