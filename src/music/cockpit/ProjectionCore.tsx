import { useEffect, useRef } from 'react'
import type { CopilotPhase } from '../copilot/CopilotPanel'

// Quantize the lens at its native pixel resolution. Scaling this buffer keeps
// the ordered stipple aligned with the surrounding low-resolution instruments.
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const phosphors = [[11, 23, 22], [34, 62, 54], [67, 108, 88], [134, 183, 146], [217, 239, 190]]
const brass = [[25, 28, 23], [73, 64, 39], [133, 104, 55], [204, 162, 89], [255, 226, 157]]
const tau = Math.PI * 2
const size = 224
const center = size / 2

function renderLens() {
  const disc = document.createElement('canvas')
  disc.width = disc.height = 144
  const ctx = disc.getContext('2d')
  if (!ctx) return disc
  const frame = ctx.createImageData(144, 144)
  for (let y = 0; y < 144; y++) for (let x = 0; x < 144; x++) {
    const dx = (x - 71.5) / 70, dy = (y - 71.5) / 70
    const r = Math.hypot(dx, dy)
    if (r >= 1) continue
    const z = Math.sqrt(1 - r*r)
    const a = Math.atan2(dy, dx)
    const light = Math.max(0, z*.74 - dx*.49 - dy*.43)
    let luma = light*.6
    let palette = phosphors
    if (r > .77) {
      // Fine radial gearing with an engraved inner and outer rim.
      palette = brass
      luma = .12 + .43*light + .26*Math.max(0, Math.cos(a*72)) + (r>.96 || r<.8 ? .26 : 0)
    } else if (r > .33) {
      // Nine overlapping iris leaves recede toward the pupil.
      const blade = ((a/tau + r*.19 + 1)*9)%1
      luma += blade*.22 - .25 + (blade>.94 ? .44 : 0) + (r>.72 ? .25 : 0)
      luma += Math.max(0, Math.cos((r + .035*Math.cos(a*9))*125))*.085
    } else {
      luma = r>.27 ? .75 : .06+.31*light
      if (Math.hypot(dx+.055,dy+.065)<.075) luma = .98
      else if (r<.15) luma += .25
    }
    const v = Math.max(0, Math.min(1, luma))*4
    const threshold = (bayer[(y%4)*4 + x%4] + .5)/16
    const color = palette[Math.min(4, Math.floor(v) + (v%1>threshold ? 1 : 0))]
    const offset = (y*144+x)*4
    frame.data[offset] = color[0]; frame.data[offset+1] = color[1]
    frame.data[offset+2] = color[2]; frame.data[offset+3] = 255
  }
  ctx.putImageData(frame, 0, 0)
  return disc
}

function draw(ctx: CanvasRenderingContext2D, disc: HTMLCanvasElement, phase: CopilotPhase, t: number) {
  const fast = phase === 'thinking' ? 2.3 : 1
  const pulse = (1 + Math.sin(t * (phase === 'listening' ? 3 : 1.6))) / 2
  const amber = phase === 'error' ? '#f89d71' : '#e3bd7c'
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.translate(center, center)
  ctx.lineWidth = 1
  // Orbital paths are drawn in two passes so the near half crosses the lens.
  const orbit = (front: boolean) => {
    for (let ring=0; ring<2; ring++) {
      const angle = (ring === 0 ? -.51 : .98) + Math.sin(t*.32)*.14
      ctx.save(); ctx.rotate(angle)
      ctx.strokeStyle = front ? (ring ? '#95c1a4' : amber) : '#5c725a'
      ctx.lineWidth = front ? 1.4 : 1
      ctx.setLineDash(ring ? [1,3] : [])
      ctx.beginPath()
      ctx.ellipse(0, 0, 91-ring*6, 22+ring*4, 0, front ? 0 : Math.PI, front ? Math.PI : tau)
      ctx.stroke()
      ctx.setLineDash([])
      const a = (t*.36*fast + ring*2 + 1)%tau
      if ((a<Math.PI) === front) {
        ctx.fillStyle = front ? '#f2d595' : '#627761'
        ctx.fillRect(Math.round(Math.cos(a)*(91-ring*6))-1, Math.round(Math.sin(a)*(22+ring*4))-1, 4, 3)
      }
      ctx.restore()
    }
  }
  orbit(false)
  ctx.save()
  ctx.rotate(Math.sin(t*.28)*.13)
  const diameter = 116 + (phase === 'listening' ? 3*pulse : 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(disc, -diameter/2, -diameter/2, diameter, diameter)
  ctx.restore()
  // The luminous pupil stays on axis while the shutter and carriers move.
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 + pulse * 2)
  glow.addColorStop(0, '#f7ffe4')
  glow.addColorStop(.18, phase === 'error' ? '#f7b57dcc' : '#b8ffd5cc')
  glow.addColorStop(1, '#82ceb000')
  ctx.fillStyle = glow
  ctx.fillRect(-17, -17, 34, 34)
  orbit(true)
  for (let i=0; i<96; i++) {
    const a=i*tau/96, major=i%8===0
    if (i%24>=20) continue
    ctx.save(); ctx.rotate(a)
    ctx.fillStyle = major ? amber : '#597c6f'
    ctx.fillRect(-.6, -102, major ? 1.6 : 1, major ? 6 : 2)
    ctx.restore()
  }
  // Individual discrete bars form a voice carrier around the optical assembly.
  // Their envelope denotes the current interaction phase, independent of audio volume.
  for (let i = 0; i < 64; i++) {
    const a = i * tau / 64
    const envelope = Math.abs(Math.sin(3*a + t*fast)*Math.cos(2*a - t*.7))
    const excursion = phase === 'listening' ? 7 : phase === 'thinking' ? 4 : 2
    ctx.save()
    ctx.rotate(a)
    ctx.fillStyle = i % 4 === 0 ? '#a0be90' : '#709085'
    ctx.fillRect(0, -71, 1, 1 + Math.round(excursion*envelope))
    ctx.restore()
  }
  ctx.strokeStyle = phase === 'error' ? '#e38b67' : '#9ac7a7'
  ctx.lineWidth = 2
  for (let i=0; i<3; i++) {
    const a = t*.18*fast + i*tau/3
    ctx.beginPath(); ctx.arc(0,0,81,a,a+.66); ctx.stroke()
  }
  ctx.restore()
}

export function ProjectionCore({ phase, active, animate }: { phase: CopilotPhase; active: boolean; animate: boolean }) {
  const element = useRef<HTMLCanvasElement>(null)
  const texture = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = element.current
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    texture.current ??= renderLens()
    const lens = texture.current
    draw(ctx, lens, phase, 0)
    if (!active || !animate) return
    let animation = 0, last = 0
    const step = (now: number) => {
      if (now-last >= 80) { draw(ctx, lens, phase, now/1000); last = now }
      animation = requestAnimationFrame(step)
    }
    const visibility = () => {
      cancelAnimationFrame(animation)
      if (!document.hidden) animation = requestAnimationFrame(step)
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(animation); document.removeEventListener('visibilitychange', visibility) }
  }, [phase, active, animate])
  return <canvas className="projection-core" width={size} height={size} aria-hidden="true" ref={element} />
}
