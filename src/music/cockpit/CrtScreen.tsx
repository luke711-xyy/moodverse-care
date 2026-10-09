import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { crtDisplacementMap, displayToSource, screenDepth } from './screen-math'
const warp = crtDisplacementMap()
/** Native DOM stays accessible/editable. Only the displayed phosphor image is
 * curved; trusted pointer input is mapped back to its unwarped control. */
export function CrtScreen({ children, active, motion, enabled, mini = false }: { children: ReactNode; active: boolean; motion: boolean; enabled: boolean; mini?: boolean }) {
  const id = `crt-${useId().replace(/:/g, '')}`
  const root = useRef<HTMLDivElement>(null), noise = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  useLayoutEffect(() => {
    const measure = () => { const el = root.current; if (el) setSize({ width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) }) }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (root.current) observer?.observe(root.current)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [active])
  useEffect(() => {
    const canvas = noise.current
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = mini ? 120 : 420; canvas.height = mini ? 70 : 260
    const frame = ctx.createImageData(canvas.width, canvas.height)
    let raf = 0, previous = -Infinity
    const draw = (now: number) => {
      if (now - previous >= 1000 / 24) {
        previous = now
        for (let i = 0; i < frame.data.length; i += 4) {
          const value = Math.random() > .7 ? 230 : Math.random() * 80
          frame.data[i] = value; frame.data[i+1] = value; frame.data[i+2] = value; frame.data[i+3] = 255
        }
        ctx.putImageData(frame, 0, 0)
      }
      if (active && motion && enabled && !document.hidden) raf = requestAnimationFrame(draw)
    }
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden && active && motion && enabled) raf = requestAnimationFrame(draw) }
    draw(0); document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility) }
  }, [active, motion, enabled, mini])
  const retarget = (event: MouseEvent<HTMLDivElement>) => {
    // Synthetic keyboard/accessibility clicks already use the native target.
    if (mini || !enabled || !event.isTrusted || !event.detail || !root.current) return
    const rect = root.current.getBoundingClientRect()
    const point = displayToSource(event.clientX - rect.left, event.clientY - rect.top, size)
    const target = document.elementFromPoint(rect.left + point.x, rect.top + point.y)?.closest<HTMLElement>('button, a, input, textarea, select')
    const original = (event.target as Element).closest('button, a, input, textarea, select')
    if (!target || target === original || !root.current.contains(target) || target.matches(':disabled')) return
    event.preventDefault(); event.stopPropagation(); target.focus({ preventScroll: true }); target.click()
  }
  return <div ref={root} className={`crt-screen${mini ? ' crt-mini' : ''}`} data-crt-enabled={enabled} data-crt-motion={active && motion && enabled} onClickCapture={retarget}>
    <svg className="cockpit-filter-definitions" aria-hidden="true" width="0" height="0"><defs><filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={mini ? '2' : '5'} result="halo" />
      <feComponentTransfer in="halo" result="soft"><feFuncA type="linear" slope=".26" /></feComponentTransfer>
      <feMerge result="phosphor"><feMergeNode in="soft" /><feMergeNode in="SourceGraphic" /></feMerge>
      <feImage href={warp} width={size.width} height={size.height} preserveAspectRatio="none" result="warp" />
      <feDisplacementMap in="phosphor" in2="warp" scale={enabled ? screenDepth(size)*2 : 0} xChannelSelector="R" yChannelSelector="G" />
    </filter></defs></svg>
    <div className="crt-image" style={{ filter: `url(#${id}) url(#moodverse-ink-dither)` }}>{children}</div>
    <canvas ref={noise} className="crt-snow" aria-hidden="true" />
    <span className="crt-scanlines" aria-hidden="true" /><span className="crt-scan-bar" aria-hidden="true" /><span className="crt-lens" aria-hidden="true" />
  </div>
}
