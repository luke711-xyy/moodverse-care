import { useEffect, useRef, useState } from 'react'
import { effectiveDitherParameters, type DitherPlanetSpec } from './appearance'
import { createDitherRenderer, type DitherFrame } from './renderer'
import { advanceDitherPhase, renderDitherImage, type DitherAssetKind } from './sampler'
import { createDitherMotion, DEFAULT_TIDE_BPM } from './motion'
import './dither.css'

const thumbnailCache = new Map<string, HTMLCanvasElement>()
export function cachedDitherCanvas(spec: DitherPlanetSpec, size = 128, kind: DitherAssetKind = 'planet'): HTMLCanvasElement {
  const key = `${kind}:${size}:${JSON.stringify(spec)}`
  const cached = thumbnailCache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const image = ctx.createImageData(size, size)
    image.data.set(renderDitherImage(spec, size, 0, kind))
    ctx.putImageData(image, 0, 0)
  }
  if (thumbnailCache.size >= 128) thumbnailCache.delete(thumbnailCache.keys().next().value!)
  thumbnailCache.set(key, canvas)
  return canvas
}

export function DitherThumbnail({ spec, label = '', size = 96, kind = 'planet' }: { spec: DitherPlanetSpec; label?: string; size?: number; kind?: DitherAssetKind }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d')
    if (canvas && ctx) { ctx.clearRect(0, 0, size, size); ctx.drawImage(cachedDitherCanvas(spec, size, kind), 0, 0) }
  }, [spec, size, kind])
  return <canvas ref={ref} className="dither-thumb" width={size} height={size} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={!label} />
}

export function DitherCanvas({ getFrame, reducedMotion = false, forceFallback = false, quality = 'auto', onModeChange }: {
  getFrame: (width: number, height: number, phase: number) => DitherFrame
  reducedMotion?: boolean
  forceFallback?: boolean
  quality?: 'auto' | 'low' | 'high'
  onModeChange?: (mode: 'webgl2' | 'canvas2d') => void
}) {
  const glRef = useRef<HTMLCanvasElement>(null), fallbackRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ getFrame, reducedMotion, quality, onModeChange })
  const restartRef = useRef<(() => void) | null>(null)
  const phasesRef = useRef(new Map<string, number>())
  latest.current = { getFrame, reducedMotion, quality, onModeChange }
  const [mode, setMode] = useState<'webgl2' | 'canvas2d'>('webgl2')
  useEffect(() => {
    const canvas = glRef.current!, fallback = fallbackRef.current!
    let renderer: ReturnType<typeof createDitherRenderer> | null = null, raf = 0, disposed = false
    let last = 0, phase = 0, seconds = 0, lowFrames = 0, automaticLow = false
    const motion = createDitherMotion()
    const phases = phasesRef.current
    let pointer: { x: number; y: number } | undefined
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = latest.current.reducedMotion || media.matches
    const isRunning = () => !reduced && !document.hidden
    const report = (next: typeof mode) => { setMode(next); latest.current.onModeChange?.(next) }
    const initialize = () => {
      renderer?.dispose(); renderer = null
      try { if (forceFallback) throw new Error('explicit fallback'); renderer = createDitherRenderer(canvas); report('webgl2') }
      catch { report('canvas2d') }
    }
    const paint = (now: number) => {
      if (disposed) return
      reduced = latest.current.reducedMotion || media.matches
      const elapsed = last ? (now - last) / 1000 : 0
      if (isRunning() && elapsed > .024 && elapsed < .2) lowFrames++; else lowFrames = Math.max(0, lowFrames - 1)
      if (lowFrames > 90) automaticLow = true
      last = now
      // The scene clock must not wrap at 2π: slower orbital rates would jump
      // back before ever reaching the far side. Each material clock below is
      // independent and remains bounded/periodic for shader precision.
      if (isRunning()) { const dt = Math.max(0, Math.min(.05, elapsed)); phase += dt * .2; seconds += dt }
      const bounds = canvas.getBoundingClientRect(), width = Math.max(1, bounds.width), height = Math.max(1, bounds.height)
      const frame = latest.current.getFrame(width, height, phase)
      const visible = new Set(frame.assets.map((asset) => asset.id))
      for (const key of phases.keys()) if (!visible.has(key)) phases.delete(key)
      frame.assets = frame.assets.map((asset) => {
        const next = advanceDitherPhase(phases.get(asset.id) ?? 0, elapsed, effectiveDitherParameters(asset.spec).speed, isRunning())
        phases.set(asset.id, next); return { ...asset, phase: next }
      })
      frame.pointer = reduced ? undefined : pointer
      const low = latest.current.quality === 'low' || latest.current.quality === 'auto' && automaticLow
      motion.apply(frame, elapsed, seconds, isRunning() && Boolean(renderer), low)
      canvas.dataset.ditherParticles = String(frame.assets.reduce((sum, asset) => sum + (asset.particles?.count ?? 0), 0))
      canvas.dataset.ditherBpm = String(DEFAULT_TIDE_BPM)
      canvas.dataset.ditherTime = String(seconds)
      canvas.dataset.ditherQuality = low ? 'low' : 'normal'
      if (renderer) renderer.draw(frame, Math.min(window.devicePixelRatio || 1, low ? 1 : latest.current.quality === 'high' ? 2 : 1.5))
      else {
        const ctx = fallback.getContext('2d')
        if (ctx) {
          if (fallback.width !== Math.round(width) || fallback.height !== Math.round(height)) { fallback.width = Math.round(width); fallback.height = Math.round(height) }
          ctx.clearRect(0, 0, width, height)
          ctx.imageSmoothingEnabled = false
          const drawStatic = (asset: DitherFrame['assets'][number]) => {
            const radius = asset.radius * effectiveDitherParameters(asset.spec).size
            ctx.save(); ctx.globalAlpha = asset.opacity ?? 1; ctx.translate(asset.x, asset.y); ctx.rotate(asset.rotation ?? 0)
            ctx.drawImage(cachedDitherCanvas(asset.spec, radius > 100 ? 256 : 128, asset.kind), -radius * 1.2, -radius * 1.2, radius * 2.4, radius * 2.4); ctx.restore()
          }
          frame.background?.clouds.forEach(drawStatic)
          if (frame.background) {
            const { points, count } = frame.background.stars
            for (let i = 0; i < count; i++) { const n = i * 6; ctx.globalAlpha = points[n + 5] * frame.background.opacity; ctx.fillStyle = '#c0b8d0'; ctx.fillRect(Math.floor(points[n]), Math.floor(points[n + 1]), Math.ceil(points[n + 4]), Math.ceil(points[n + 4])) }
            ctx.globalAlpha = 1
          }
          frame.assets.forEach(drawStatic)
        }
      }
      if (isRunning() && renderer) raf = requestAnimationFrame(paint)
    }
    // An asset must exist immediately, including a background-tab first load.
    // Visibility only pauses subsequent animation, never the initial content.
    const restart = () => { cancelAnimationFrame(raf); last = 0; paint(performance.now()) }
    restartRef.current = restart
    const onPointer = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; if (!isRunning()) restart() }
    const onLeave = () => { pointer = undefined; if (!isRunning()) restart() }
    const onLost = (event: Event) => { event.preventDefault(); renderer?.dispose(); renderer = null; report('canvas2d'); restart() }
    const onRestored = () => { initialize(); restart() }
    const parent = canvas.parentElement
    parent?.addEventListener('pointermove', onPointer); parent?.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored)
    document.addEventListener('visibilitychange', restart); media.addEventListener('change', restart)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restart)
    observer?.observe(canvas); window.addEventListener('resize', restart)
    initialize(); restart()
    return () => {
      disposed = true; cancelAnimationFrame(raf); renderer?.dispose(); observer?.disconnect()
      restartRef.current = null
      parent?.removeEventListener('pointermove', onPointer); parent?.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored)
      document.removeEventListener('visibilitychange', restart); media.removeEventListener('change', restart); window.removeEventListener('resize', restart)
    }
  }, [forceFallback])
  // Visual edits and pause toggles repaint in-place. They must not allocate a new
  // shader program or reset the per-asset clock on every React state update.
  useEffect(() => { restartRef.current?.() }, [getFrame, reducedMotion, quality])
  return <>
    <canvas ref={glRef} className="dither-canvas" aria-hidden="true" data-dither-renderer={mode} style={{ visibility: mode === 'webgl2' ? 'visible' : 'hidden' }} />
    <canvas ref={fallbackRef} className="dither-canvas" aria-hidden="true" style={{ visibility: mode === 'canvas2d' ? 'visible' : 'hidden' }} />
  </>
}
