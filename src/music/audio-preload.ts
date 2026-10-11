/** Speculative media never competes with a hidden page or a constrained link.
 * This does not restrict playback explicitly requested by the user. */
export function canPreloadMusic() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !document.hidden && navigator.onLine !== false && !connection?.saveData
    && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
}
