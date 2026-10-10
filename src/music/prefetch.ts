/** Warm at most two likely public pages, after first paint and without competing
 * with the foreground request. No private data or audio is prefetched. */
export function scheduleMusicPrefetch(jobs: Array<() => Promise<unknown>>) {
  let stopped = false, idle = 0
  const allowed = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    return !stopped && !document.hidden && navigator.onLine !== false && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  }
  const queue = jobs.slice(0, 2)
  const next = () => {
    if (!allowed() || !queue.length) return
    const run = async () => {
      if (!allowed()) return
      try { await queue.shift()!() } catch { /* Foreground reads remain retryable. */ }
      next()
    }
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(() => { void run() })
    else void run()
  }
  const timer = window.setTimeout(next, 1500)
  return () => { stopped = true; window.clearTimeout(timer); if (idle) window.cancelIdleCallback(idle) }
}
