export type LightningVector = [number, number, number]

const TAU = Math.PI * 2

const PATHS: Array<{ across: number[]; depth: number[] }> = [
  { across: [0, .24, -.3, .2, -.34, .28, 0], depth: [0, -.16, .22, -.3, .18, .08, 0] },
  { across: [0, -.32, .18, .38, -.18, -.26, 0], depth: [0, .2, -.24, .12, .32, -.12, 0] },
  { across: [0, .38, -.12, -.34, .26, -.16, 0], depth: [0, -.28, -.06, .3, -.24, .2, 0] },
  { across: [0, -.2, -.4, .14, .3, -.32, 0], depth: [0, .32, -.14, -.2, .24, .12, 0] },
]

function randomSequence(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

function normalize([x, y, z]: LightningVector): LightningVector {
  const length = Math.hypot(x, y, z)
  if (!Number.isFinite(length) || length < 1e-8) return [0, 0, 1]
  return [x / length, y / length, z / length]
}

function cross([ax, ay, az]: LightningVector, [bx, by, bz]: LightningVector): LightningVector {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
}

function combine(a: LightningVector, aScale: number, b: LightningVector, bScale: number): LightningVector {
  return [a[0] * aScale + b[0] * bScale, a[1] * aScale + b[1] * bScale, a[2] * aScale + b[2] * bScale]
}

/** A deterministic, lightweight strike path over the camera-facing side of a planet. */
export function generateLightningPath(
  seed: number,
  strikeIndex: number,
  visibleNormal: LightningVector,
  radius: number,
): LightningVector[] {
  const safeRadius = Number.isFinite(radius) ? Math.max(.001, radius) : .16
  const random = randomSequence((seed ^ Math.imul(strikeIndex + 1, 0x9e3779b1)) >>> 0)
  const front = normalize(visibleNormal)
  const reference: LightningVector = Math.abs(front[1]) < .88 ? [0, 1, 0] : [1, 0, 0]
  const frontTangent = normalize(cross(front, reference))
  const frontBitangent = normalize(cross(front, frontTangent))

  // Keep strikes on the visible hemisphere while spreading them over its surface.
  const cosine = 1 - random() * .48
  const sine = Math.sqrt(1 - cosine * cosine)
  const azimuth = random() * TAU
  const strikeNormal = normalize([
    front[0] * cosine + frontTangent[0] * sine * Math.cos(azimuth) + frontBitangent[0] * sine * Math.sin(azimuth),
    front[1] * cosine + frontTangent[1] * sine * Math.cos(azimuth) + frontBitangent[1] * sine * Math.sin(azimuth),
    front[2] * cosine + frontTangent[2] * sine * Math.cos(azimuth) + frontBitangent[2] * sine * Math.sin(azimuth),
  ])

  const pathReference: LightningVector = Math.abs(strikeNormal[1]) < .88 ? [0, 1, 0] : [1, 0, 0]
  const tangent = normalize(cross(strikeNormal, pathReference))
  const bitangent = normalize(cross(strikeNormal, tangent))
  const roll = random() * TAU
  const across = normalize(combine(tangent, Math.cos(roll), bitangent, Math.sin(roll)))
  const depth = normalize(cross(strikeNormal, across))
  const template = PATHS[Math.floor(random() * PATHS.length)]
  const scale = safeRadius * (.105 + random() * .055)

  return template.across.map((offset, index) => {
    const progress = index / (template.across.length - 1)
    const envelope = Math.sin(progress * Math.PI)
    const jitterAcross = (random() - .5) * .42
    const jitterDepth = (random() - .5) * .42
    const radial = safeRadius * (1.24 - progress * .22)
    const side = (offset + jitterAcross) * envelope * scale
    const sideDepth = (template.depth[index] + jitterDepth) * envelope * scale
    return [
      strikeNormal[0] * radial + across[0] * side + depth[0] * sideDepth,
      strikeNormal[1] * radial + across[1] * side + depth[1] * sideDepth,
      strikeNormal[2] * radial + across[2] * side + depth[2] * sideDepth,
    ]
  })
}
