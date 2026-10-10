import type { DitherParameters } from './appearance'
import { viewToBody, type Orientation } from './arcball'

/** Project the rotating body's silhouette, not a static disc with moving paint.
 * An ellipsoid's hidden depth changes its apparent width through a turn. Rim
 * lobes belong to body space and rotate on the same axis as the material.
 * Near-spherical depth keeps every form round after freehand rotation; small
 * rim lobes distinguish the forms without making their body look flattened.
 * Keep this math in sync with bodyRadius() in shaders.ts.
 */
export function bodyRadius(form: DitherParameters['form'], angle: number, phase: number, pulse: number, orientation?: Orientation) {
  const c = Math.cos(phase), s = Math.sin(phase), x = Math.cos(angle), y = Math.sin(angle)
  const zAxis = form === 'organic' ? .97 : form === 'particles' ? .985 : form === 'pulse' ? .98 : .99
  const a = viewToBody(x, y, 0, orientation), b = viewToBody(0, 0, 1, orientation)
  const ax = a[0] * c + a[2] * s, ay = a[1], az = (-a[0] * s + a[2] * c) / zAxis
  const bx = b[0] * c + b[2] * s, by = b[1], bz = (-b[0] * s + b[2] * c) / zAxis
  // The tangent view ray solves the oriented ellipsoid's quadratic.
  const rayA = bx * bx + by * by + bz * bz, rayB = ax * bx + ay * by + az * bz
  const rayC = ax * ax + ay * ay + az * az
  let radius = (.85 + Math.sin(phase) * pulse * .035) / Math.sqrt(Math.max(1e-8, rayC - rayB * rayB / rayA))
  const tangentZ = -rayB / rayA
  const bodyX = ax + tangentZ * bx, bodyY = ay + tangentZ * by, bodyZ = az + tangentZ * bz
  const bodyAngle = Math.atan2(bodyY, bodyX)
  // Longitude detail fades at body-space poles instead of popping there.
  const lobeWeight = Math.hypot(bodyX, bodyY) / Math.hypot(bodyX, bodyY, bodyZ)
  if (form === 'organic') radius += (.018 * Math.sin(bodyAngle * 3) + .01 * Math.cos(bodyAngle * 7)) * lobeWeight
  if (form === 'pulse') radius += .018 * Math.cos(bodyAngle * 8) * lobeWeight
  return radius
}

/** An analytic sphere projected onto a quad, not a mesh or a scene camera.
 * Texture coordinates are attached to the rotating surface, while the light
 * stays in view space. asin charts are continuous across a complete turn (no
 * longitude seam); their compression at the rim gives the texture volume.
 * Keep this math in sync with sphereSurface() in shaders.ts.
 */
export function sphereSurface(x: number, y: number, radius: number, phase: number, viewRotation = 0, orientation?: Orientation) {
  const extent = Math.max(radius, Math.hypot(x, y))
  const nx = x / extent, ny = y / extent
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  const c = Math.cos(phase), s = Math.sin(phase)
  const body = viewToBody(nx, ny, nz, orientation)
  const sx = body[0] * c + body[2] * s, sz = -body[0] * s + body[2] * c
  const sy = body[1] * Math.cos(.22) - sz * Math.sin(.22)
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
