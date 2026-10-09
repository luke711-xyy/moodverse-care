import { useEffect, useRef, useState } from 'react'
import type { PublicMusicPlanet } from '../../music-api'
import type { ExteriorDestination } from './state'

export type CockpitFlight = {
  token: number; from: ExteriorDestination; to: ExteriorDestination; progress: number; ready: boolean
  sourceVisitor: PublicMusicPlanet | null; targetVisitor: PublicMusicPlanet | null; returning: boolean
}
/** Relative visual speed, not a claimed physical velocity. Use the same flight
 * progress as the nebula renderer; requests alone must never move the needle. */
export function getFlightSpeed(flight: CockpitFlight | null) {
  if (!flight || !Number.isFinite(flight.progress)) return 0
  const progress = Math.max(0, Math.min(1, flight.progress))
  if (progress === 0 || progress === 1) return 0
  if (!flight.ready && progress >= .5) return .12
  return Math.pow(Math.sin(Math.PI * progress), 1.4)
}
/** A slow response holds the view inside the cloud, never at a partially loaded destination. */
export function advanceFlight(progress: number, elapsedMs: number, ready: boolean, reduced: boolean) {
  if (reduced) return ready ? 1 : .5
  const next = progress + Math.max(0, Math.min(50, elapsedMs)) / 2100
  return Math.min(ready ? 1 : .5, next)
}
export function useCockpitFlight(reducedMotion: boolean, onArrive: (flight: CockpitFlight) => void) {
  const [flight, setFlight] = useState<CockpitFlight | null>(null)
  const current = useRef<CockpitFlight | null>(null)
  const sequence = useRef(0)
  const arrival = useRef(onArrive); arrival.current = onArrive
  const start = (input: Omit<CockpitFlight, 'token' | 'progress'>) => {
    if (current.current) return null
    const trip = { ...input, token: ++sequence.current, progress: 0 }
    current.current = trip; setFlight(trip)
    return trip.token
  }
  const ready = (token: number, visitor: PublicMusicPlanet | null = null) => {
    const trip = current.current
    if (!trip || trip.token !== token) return false
    current.current = { ...trip, ready: true, targetVisitor: visitor ?? trip.targetVisitor }
    setFlight(current.current)
    return true
  }
  const cancel = () => {
    const token = current.current?.token
    current.current = null; setFlight(null)
    return token
  }
  useEffect(() => {
    if (!flight) return
    let frame = 0, last = performance.now(), retreatRemaining = reducedMotion || flight.progress > 0 ? 0 : 450
    const tick = (now: number) => {
      const trip = current.current
      if (!trip || trip.token !== flight.token) return
      const elapsed = document.hidden ? 0 : Math.min(50, now - last)
      const progress = retreatRemaining > 0 ? trip.progress : advanceFlight(trip.progress, elapsed, trip.ready, reducedMotion)
      retreatRemaining = Math.max(0, retreatRemaining - elapsed)
      last = now
      current.current = { ...trip, progress }; setFlight(current.current)
      if (progress === 1) {
        const completed = current.current
        current.current = null; setFlight(null); arrival.current(completed)
      } else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [flight?.token, flight?.ready, reducedMotion])
  return { flight, start, ready, cancel, isCurrent: (token: number) => current.current?.token === token }
}
