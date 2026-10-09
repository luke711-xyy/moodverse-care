import { useCallback, useEffect, useRef, useState } from 'react'
import { TOUR_END } from '../universe'
import { createGalaxyJourneyMotion, sampleGalaxyJourneyMotion, type GalaxyJourneyMotion } from './galaxy-navigation'

/** Owns the one tour coordinate consumed by the scene, axis, and HUD. */
export function useGalaxyJourney(reducedMotion: boolean, enabled: boolean) {
  const [journey, updateJourney] = useState(0)
  const journeyRef = useRef(0)
  const frame = useRef(0)
  const motion = useRef<{ route: GalaxyJourneyMotion; elapsed: number; last: number } | null>(null)
  const write = useCallback((value: number) => {
    journeyRef.current = Math.max(0, Math.min(TOUR_END, value))
    updateJourney(journeyRef.current)
  }, [])
  const cancel = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    motion.current = null
  }, [])
  const setJourney = useCallback((value: number) => {
    if (!Number.isFinite(value)) return
    cancel()
    write(value)
  }, [cancel, write])
  const animateTo = useCallback((value: number, count: number) => {
    if (!enabled || !Number.isFinite(value)) return
    cancel()
    const target = Math.max(0, Math.min(TOUR_END, value))
    if (reducedMotion || target === journeyRef.current) { write(target); return }
    motion.current = { route: createGalaxyJourneyMotion(journeyRef.current, target, count), elapsed: 0, last: performance.now() }
    const tick = (now: number) => {
      const trip = motion.current
      if (!trip) return
      trip.elapsed += document.hidden ? 0 : Math.max(0, now - trip.last)
      trip.last = now
      write(sampleGalaxyJourneyMotion(trip.route, trip.elapsed))
      if (trip.elapsed >= trip.route.durationMs) { motion.current = null; frame.current = 0 }
      else frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [cancel, enabled, reducedMotion, write])
  useEffect(() => {
    if (!enabled) cancel()
    else if (reducedMotion && motion.current) setJourney(motion.current.route.to)
  }, [enabled, reducedMotion, cancel, setJourney])
  useEffect(() => {
    // Pause while backgrounded instead of teleporting on the first visible frame.
    const visibility = () => { if (motion.current) motion.current.last = performance.now() }
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); cancel() }
  }, [cancel])
  return { journey, journeyRef, setJourney, animateTo }
}
