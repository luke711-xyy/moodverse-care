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
