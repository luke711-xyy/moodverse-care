import type { DitherParameters } from './appearance'

/** Project the rotating body's silhouette, not a static disc with moving paint.
 * An ellipsoid's hidden depth changes its apparent width through a turn. Rim
 * lobes belong to body space and rotate on the same axis as the material.
 * Phase zero preserves the original silhouette for cached previews/picking.
 * Keep this math in sync with bodyRadius() in shaders.ts.
 */
export function bodyRadius(form: DitherParameters['form'], angle: number, phase: number, pulse: number) {
  const c = Math.cos(phase), s = Math.sin(phase), x = Math.cos(angle), y = Math.sin(angle)
  const zAxis = form === 'organic' ? .78 : form === 'particles' ? .88 : form === 'pulse' ? .83 : .9
  const width = Math.sqrt(c * c + zAxis * zAxis * s * s)
  let radius = (.85 + Math.sin(phase) * pulse * .035) / Math.hypot(x / width, y)
  const rayA = s * s + c * c / (zAxis * zAxis)
  const rayB = x * c * s * (1 - 1 / (zAxis * zAxis))
  const tangentZ = -rayB / rayA
  const bodyX = x * c + tangentZ * s, bodyZ = (-x * s + tangentZ * c) / zAxis
  const bodyAngle = Math.atan2(y, bodyX)
  // Longitude detail fades at body-space poles instead of popping there.
  const lobeWeight = Math.hypot(bodyX, y) / Math.hypot(bodyX, y, bodyZ)
  if (form === 'organic') radius += (.055 * Math.sin(bodyAngle * 3) + .035 * Math.cos(bodyAngle * 7)) * lobeWeight
  if (form === 'pulse') radius += .04 * Math.cos(bodyAngle * 8) * lobeWeight
  return radius
}

/** An analytic sphere projected onto a quad, not a mesh or a scene camera.
 * Texture coordinates are attached to the rotating surface, while the light
 * stays in view space. asin charts are continuous across a complete turn (no
 * longitude seam); their compression at the rim gives the texture volume.
 * Keep this math in sync with sphereSurface() in shaders.ts.
 */
export function sphereSurface(x: number, y: number, radius: number, phase: number, viewRotation = 0) {
  const extent = Math.max(radius, Math.hypot(x, y))
  const nx = x / extent, ny = y / extent
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  const c = Math.cos(phase), s = Math.sin(phase)
  const sx = nx * c + nz * s, sz = -nx * s + nz * c
  const sy = ny * Math.cos(.22) - sz * Math.sin(.22)
  const lx = nx * Math.cos(viewRotation) - ny * Math.sin(viewRotation)
  const ly = nx * Math.sin(viewRotation) + ny * Math.cos(viewRotation)
  const diffuse = Math.max(0, -.46 * lx - .48 * ly + .74 * nz)
  const highlight = Math.pow(Math.max(0, -.29 * lx - .3 * ly + .91 * nz), 24) * .2
  const rim = Math.pow(1 - nz, 3) * .12
  return {
    x: Math.asin(Math.max(-1, Math.min(1, sx))) * .62,
    y: Math.asin(Math.max(-1, Math.min(1, sy))) * .62,
    light: .24 + .85 * diffuse,
    highlight: highlight + rim,
    depth: nz,
  }
}
