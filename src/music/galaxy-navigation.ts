import { TOUR_END } from '../universe'

/** One coordinate for the viewport, selected label, and navigation marker.
 * The final home node is a travel button, not another galaxy stop.
 */
export function galaxyTourPosition(progress: number, count: number) {
  const systemIndex = Math.max(0, Math.min(1, progress)) * Math.max(0, count - 1)
  return { systemIndex, currentIndex: Math.round(systemIndex), axisProgress: count ? systemIndex / count : 0 }
}

export type GalaxyJourneyMotion = { from: number; to: number; durationMs: number }
const RAMP_MS = 300
/** A shared cruise rate (650 ms per sector) with gentle acceleration/braking.
 * This moves the actual tour coordinate, not a separate visual-only offset. */
export function createGalaxyJourneyMotion(from: number, to: number, count: number): GalaxyJourneyMotion {
  const stops = Math.abs(to - from) / TOUR_END * Math.max(0, count - 1)
  return { from, to, durationMs: Math.max(RAMP_MS * 2, stops * 650 + RAMP_MS) }
}
export function sampleGalaxyJourneyMotion(motion: GalaxyJourneyMotion, elapsedMs: number) {
  const p = Math.max(0, Math.min(1, elapsedMs / motion.durationMs))
  if (p === 0) return motion.from
  if (p === 1) return motion.to
  const ramp = RAMP_MS / motion.durationMs
  const accelerate = (t: number) => (t - ramp * Math.sin(Math.PI * t / ramp) / Math.PI) / (2 * (1 - ramp))
  const eased = p < ramp ? accelerate(p)
    : p > 1 - ramp ? 1 - accelerate(1 - p) : (p - ramp / 2) / (1 - ramp)
  return motion.from + (motion.to - motion.from) * eased
}
