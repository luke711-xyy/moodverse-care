export type ViewportPoint = { x: number; y: number }
type ViewportSize = { width: number; height: number }
type ViewportRect = ViewportSize & { left: number; top: number; right: number }

/** CSS rotates the whole app, never its state or renderer. All drawing and
 * picking continue in the unrotated, landscape coordinate system. */
export function logicalSize(element: HTMLElement): ViewportSize {
  const rect = element.getBoundingClientRect()
  return { width: Math.max(1, element.clientWidth || rect.width), height: Math.max(1, element.clientHeight || rect.height) }
}
export function isQuarterTurn(element: HTMLElement): boolean {
  return getComputedStyle(element).getPropertyValue('--music-viewport-rotation').trim() === '90'
}
export function screenToLocal(point: ViewportPoint, rect: ViewportRect, size: ViewportSize, rotated: boolean): ViewportPoint {
  return rotated
    ? { x: (point.y - rect.top) * size.width / Math.max(1, rect.height), y: (rect.right - point.x) * size.height / Math.max(1, rect.width) }
    : { x: (point.x - rect.left) * size.width / Math.max(1, rect.width), y: (point.y - rect.top) * size.height / Math.max(1, rect.height) }
}
export function localToScreen(point: ViewportPoint, rect: ViewportRect, size: ViewportSize, rotated: boolean): ViewportPoint {
  return rotated
    ? { x: rect.right - point.y * rect.width / size.height, y: rect.top + point.x * rect.height / size.width }
    : { x: rect.left + point.x * rect.width / size.width, y: rect.top + point.y * rect.height / size.height }
}
export function clientPoint(element: HTMLElement, clientX: number, clientY: number): ViewportPoint {
  return screenToLocal({ x: clientX, y: clientY }, element.getBoundingClientRect(), logicalSize(element), isQuarterTurn(element))
}
