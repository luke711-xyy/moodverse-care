import type { DoodleStroke } from './types'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function normalizeDoodleStroke(stroke: DoodleStroke): DoodleStroke {
  if (stroke.coordinateSpace === 'normalized') {
    return {
      ...stroke,
      points: stroke.points.map(([x, y]) => [clamp01(x), clamp01(y)]),
      width: Math.min(.08, Math.max(.002, stroke.width)),
    }
  }

  // Older saved strokes used a wide 360 × 100 px canvas. Fit them into the
  // square surface while preserving their original proportions.
  const legacySide = 360
  const legacyHeight = 100
  const topInset = (legacySide - legacyHeight) / 2
  return {
    ...stroke,
    points: stroke.points.map(([x, y]) => [clamp01(x / legacySide), clamp01((y + topInset) / legacySide)]),
    width: Math.min(.08, Math.max(.002, stroke.width / legacySide)),
    coordinateSpace: 'normalized',
  }
}

export function drawDoodleStrokes(
  context: CanvasRenderingContext2D,
  strokes: DoodleStroke[],
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return
  context.save()
  context.scale(width, height)
  for (const rawStroke of strokes) {
    const stroke = normalizeDoodleStroke(rawStroke)
    if (!stroke.points.length) continue
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = stroke.width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0]
      context.beginPath()
      context.arc(x, y, stroke.width / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    stroke.points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
    context.stroke()
  }
  context.restore()
}
