/** Body-to-view orientation, using screen X/Y and depth toward the viewer. */
export type Orientation = readonly [number, number, number, number]
export const IDENTITY_ORIENTATION: Orientation = [0, 0, 0, 1]
type Point = { x: number; y: number }
type Vector = readonly [number, number, number]

function project(point: Point, center: Point, radius: number): Vector {
  const x = (point.x - center.x) / Math.max(1, radius), y = (point.y - center.y) / Math.max(1, radius)
  const d = Math.hypot(x, y)
  // A hyperbolic skirt keeps drags continuous beyond the visible limb.
  const z = d < Math.SQRT1_2 ? Math.sqrt(1 - d * d) : .5 / d
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/** Map the two pointer anchors onto a virtual sphere; compose in view space
 * so a vertical drag stays vertical even after many previous rotations. */
export function dragOrientation(initial: Orientation, from: Point, to: Point, center: Point, radius: number): Orientation {
  const a = project(from, center, radius), b = project(to, center, radius)
  const dx = a[1] * b[2] - a[2] * b[1], dy = a[2] * b[0] - a[0] * b[2], dz = a[0] * b[1] - a[1] * b[0]
  const dw = 1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const [x, y, z, w] = initial
  const q = [dw * x + dx * w + dy * z - dz * y, dw * y - dx * z + dy * w + dz * x,
    dw * z + dx * y - dy * x + dz * w, dw * w - dx * x - dy * y - dz * z]
  const length = Math.hypot(...q)
  return length > 1e-12 ? [q[0] / length, q[1] / length, q[2] / length, q[3] / length] : initial
}

/** Inverse quaternion rotation: the renderer traces view rays into the body. */
export function viewToBody(x: number, y: number, z: number, orientation: Orientation = IDENTITY_ORIENTATION): Vector {
  const [qx, qy, qz, qw] = orientation
  const tx = 2 * (qz * y - qy * z), ty = 2 * (qx * z - qz * x), tz = 2 * (qy * x - qx * y)
  return [x + qw * tx - qy * tz + qz * ty, y + qw * ty - qz * tx + qx * tz, z + qw * tz - qx * ty + qy * tx]
}
