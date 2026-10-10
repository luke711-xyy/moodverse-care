import { useEffect, useState } from 'react'

export function GalaxyAxisNode({ home = false, reducedMotion }: { home?: boolean; reducedMotion: boolean }) {
  const [shimmer, setShimmer] = useState(false)
  useEffect(() => {
    setShimmer(false)
    if (reducedMotion) return
    let next = 0, settle = 0
    const schedule = () => {
      next = window.setTimeout(() => {
        // Independent, sparse pulses; never flash all navigation nodes together.
        if (!document.hidden && Math.random() < .2) {
          setShimmer(true)
          settle = window.setTimeout(() => setShimmer(false), 900)
        }
        schedule()
      }, 6000 + Math.random() * 9000)
    }
    schedule()
    return () => { window.clearTimeout(next); window.clearTimeout(settle) }
  }, [reducedMotion])
  return <svg className="music-axis-reticle" viewBox="0 0 40 40" aria-hidden="true" data-shimmer={shimmer}>
    <path d="M12 7 Q20 2 28 7 M33 12 Q38 20 33 28 M28 33 Q20 38 12 33 M7 28 Q2 20 7 12 M20 4.5V1 M35.5 20H39 M20 35.5V39 M4.5 20H1" />
    {home ? <path d="m13 20 7-7 7 7 M15 18v9h10V18" /> : <rect x="14" y="14" width="12" height="12" rx="3.5" />}
  </svg>
}
