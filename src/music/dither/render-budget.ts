/** Reversible animation pacing, never a material/pixel-quality decision.
 * Ignore startup, require sustained overload, and recover only when both our
 * own work and native RAF cadence have headroom (GPU/compositor included).
 */
export function createRenderBudget() {
  let fps: 60 | 30 = 60, started: number | undefined, previous = 0, pressure = 0, headroom = 0
  return {
    get fps() { return fps },
    reset() { fps = 60; started = undefined; previous = 0; pressure = 0; headroom = 0 },
    sample(now: number, workMs: number, rafMs: number) {
      if (started == null) { started = previous = now; return }
      const dt = Math.max(0, Math.min(100, now - previous)); previous = now
      if (now - started <= 2000) return
      if (fps === 60) {
        pressure = Math.max(0, pressure + (workMs > 18 || rafMs > 26 ? dt : -dt * 2))
        if (pressure >= 2000) { fps = 30; pressure = 0; headroom = 0 }
      } else {
        headroom = workMs < 10 && rafMs > 0 && rafMs < 21 ? headroom + dt : 0
        if (headroom >= 6000) { fps = 60; headroom = 0; pressure = 0 }
      }
    },
  }
}
