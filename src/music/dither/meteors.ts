import type { ParticleCloud } from './motion'

export type MeteorCloud = ParticleCloud & { activeCount: number }
type Meteor = { edge: 'top' | 'right'; start: number; age: number; speed: number; size: number; brightness: number; length: number }
const SAMPLES = 128, DX = -.8, DY = .6

/** A small, per-scene shower. No timers, DOM targets, or unbounded particle allocation. */
export function createMeteorShower(random = Math.random) {
  const cloud: MeteorCloud = { count: 0, activeCount: 0, points: new Float32Array(2 * SAMPLES * 6) }
  let meteors: Meteor[] = [], remaining = 4 + random() * 4
  return {
    advance(delta: number, width: number, height: number, running: boolean): MeteorCloud {
      cloud.count = 0; cloud.activeCount = 0
      if (!running || width <= 0 || height <= 0) return cloud
      const dt = Math.max(0, Math.min(.05, delta)), diagonal = Math.hypot(width, height)
      remaining -= dt
      if (remaining <= 0 && !meteors.length) {
        const count = random() < .25 ? 2 : 1
        const firstEdge = random() < .5 ? 'top' : 'right'
        meteors = Array.from({ length: count }, (_, i) => ({
          // A pair uses different edges, so even identical random samples cannot overlap.
          edge: i === 0 ? firstEdge : firstEdge === 'top' ? 'right' : 'top',
          start: .08 + random() * .78, age: 0, speed: .38 + random() * .22,
          size: 1.1 + random() * 1.6, brightness: .28 + random() * .48, length: .045 + random() * .065,
        }))
        remaining = 9 + random() * 15
      }
      meteors = meteors.filter(meteor => {
        meteor.age += dt
        const x = meteor.edge === 'top' ? meteor.start * width : width
        const y = meteor.edge === 'top' ? 0 : meteor.start * height
        const speed = meteor.speed * diagonal, tail = Math.max(40, Math.min(140, meteor.length * diagonal))
        const exit = Math.min(x / -DX, (height - y) / DY)
        const lifetime = (exit + tail) / speed
        if (meteor.age >= lifetime) return false
        const opacity = meteor.brightness * Math.min(1, meteor.age / .14, (lifetime - meteor.age) / .4)
        for (let i = 0; i < SAMPLES; i++) {
          const t = i / (SAMPLES - 1), distance = meteor.age * speed - tail * t
          cloud.points.set([
            x + DX * distance, y + DY * distance, .2, 0,
            meteor.size * (1 - t * .6), opacity * (1 - t) ** 2,
          ], cloud.count++ * 6)
        }
        cloud.activeCount++
        return true
      })
      return cloud
    },
  }
}
