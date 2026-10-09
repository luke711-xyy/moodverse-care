export type ScreenSize = { width: number; height: number }
export function screenDepth({ width, height }: ScreenSize) { return Math.min(44, Math.min(width, height) * .075) }
/** SVG displacement samples this source coordinate at each displayed pixel. */
export function displayToSource(x: number, y: number, size: ScreenSize, depth = screenDepth(size)) {
  const u = x / size.width * 2 - 1, v = y / size.height * 2 - 1
  return { x: x + depth * u * v * v, y: y + depth * v * u * u }
}
export function sourceToDisplay(x: number, y: number, size: ScreenSize, depth = screenDepth(size)) {
  let dx = x, dy = y
  for (let i = 0; i < 12; i++) {
    const p = displayToSource(dx, dy, size, depth)
    dx += x - p.x; dy += y - p.y
  }
  return { x: dx, y: dy }
}
// A small vector field, stretched to the exact screen aspect ratio. The
// displacement map and pointer correction intentionally share one formula.
export function crtDisplacementMap() {
  let cells = ''
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = (x + .5) / 32 - 1, v = (y + .5) / 32 - 1
    const r = Math.round((.5 + .5 * u * v * v) * 255), g = Math.round((.5 + .5 * v * u * u) * 255)
    cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${r} ${g} 128)"/>`
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${cells}</svg>`)}`
}
