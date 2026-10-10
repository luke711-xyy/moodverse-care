import { useMemo, type ReactNode } from 'react'
import { DitherThumbnail } from './dither/DitherCanvas'
import { resolveDitherSpec } from './dither/appearance'
import { DitherButton } from './dither/components'

export function PlanetCard({ planet, reason, busy = false, disabled = false, onVisit, actions, visitLabel }: {
  planet: { planetId: string | null; displayName: string; tagline: string; visual?: unknown }
  reason?: ReactNode; busy?: boolean; disabled?: boolean; onVisit?: () => void
  actions?: ReactNode; visitLabel?: string
}) {
  const spec = useMemo(() => planet.planetId && planet.visual ? resolveDitherSpec(planet.planetId, [], planet.visual) : null, [planet.planetId, planet.visual])
  const image = spec ? <DitherThumbnail spec={spec} size={160} label={`${planet.displayName} 的星球外观`} /> : <span className="music-planet-card-unavailable">外观暂不可用</span>
  return <article className="music-discovery-match music-planet-card">
    {onVisit ? <button type="button" className="music-planet-card-image" onClick={onVisit} disabled={disabled} aria-label={`查看 ${planet.displayName} 的星球`}>{image}</button>
      : <div className="music-planet-card-image">{image}</div>}
    <div className="music-discovery-match-copy"><strong>{planet.displayName}</strong>{planet.tagline && <p title={planet.tagline}>{planet.tagline}</p>}{reason && <small>{reason}</small>}</div>
    <div className="music-planet-card-actions">{actions !== undefined ? actions : onVisit && <DitherButton className="music-secondary-button" disabled={disabled} aria-label={visitLabel ?? `访问星球 ${planet.displayName}`} onClick={onVisit}>{busy ? '正在接近…' : visitLabel ?? '访问星球 ↗'}</DitherButton>}</div>
  </article>
}
