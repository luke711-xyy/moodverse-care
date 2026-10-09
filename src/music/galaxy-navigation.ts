/** One coordinate for the viewport, selected label, and navigation marker.
 * The final home node is a travel button, not another galaxy stop.
 */
export function galaxyTourPosition(progress: number, count: number) {
  const systemIndex = Math.max(0, Math.min(1, progress)) * Math.max(0, count - 1)
  return { systemIndex, currentIndex: Math.round(systemIndex), axisProgress: count ? systemIndex / count : 0 }
}
