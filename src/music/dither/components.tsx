import { useId, useMemo, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import type { MusicTrackSummary } from '../../music-domain'
import { createDitherSpec, resolveDitherSpec } from './appearance'
import { DitherThumbnail } from './DitherCanvas'
import './dither.css'
import { orbitPoint, type DitherOrbitGeometry } from './layout'

export function DitherButton({ busy = false, className = '', disabled, children, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button {...props} type={type} className={`dither-button ${className}`} disabled={disabled || busy} aria-busy={busy || undefined}>{children}</button>
}
export function DitherTitle({ children, level = 1, className = '', ...props }: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode; level?: 1 | 2 | 3 }) {
  const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
  return <Tag {...props} className={`dither-title ${className}`}>{children}</Tag>
}
export function DitherCard({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`dither-card ${className}`} />
}
export function DitherTrackMark({ track }: { track: MusicTrackSummary }) {
  const spec = useMemo(()=>createDitherSpec({ planetId:'record:'+track.id, tracks:[track] }),[track])
  return <span className="music-cover-fallback" aria-hidden="true"><DitherThumbnail spec={spec} size={64} kind="music" /></span>
}
export function DitherPlanetMark({ planetId, visual }: { planetId: string | null; visual?: unknown }) {
  const spec = useMemo(()=>planetId ? resolveDitherSpec(planetId,[],visual) : null,[planetId,visual])
  if (!spec || !visual) return null
  return <span className="dither-planet-mark" aria-hidden="true"><DitherThumbnail spec={spec} size={96} /></span>
}
export function DitherOrbit({ orbit, className = '', dots = 160 }: { orbit: DitherOrbitGeometry; className?: string; dots?: number }) {
  const count = Math.max(16, Math.min(360, Math.round(dots)))
  return <g className={`dither-orbit ${className}`} aria-hidden="true">{Array.from({ length: count }, (_, i) => {
    const point = orbitPoint(orbit, i * Math.PI * 2 / count)
    return <rect key={i} x={point.x} y={point.y} width={i % 4 === 0 ? 2 : 1} height={i % 4 === 0 ? 2 : 1} opacity={i % 4 === 0 ? .6 : .28} />
  })}</g>
}
export function DitherLoadingRing({ label = '正在加载', progress }: { label?: string; progress?: number }) {
  const id = `loading-${useId().replace(/:/g, '')}`
  const percent = progress === undefined ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100)
  return <div className="dither-loading" role="status">
    <svg className="dither-loading-ring" viewBox="0 0 120 120" aria-hidden="true">
      <defs><path id={id} d="M60,15 a45,45 0 1,1 -0.01,0" /></defs>
      <text><textPath href={`#${id}`}>··· MOODVERSE ··· MOODVERSE ···</textPath></text>
      {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={60 + Math.cos(i * Math.PI / 6) * 27} cy={60 + Math.sin(i * Math.PI / 6) * 27} r={i % 3 === 0 ? 1.8 : 1} />)}
    </svg>
    <span>{label}</span>
    {percent !== undefined && <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>{percent}%</span>}
  </div>
}
