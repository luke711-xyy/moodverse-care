/** In-memory only, scoped to one API instance. Never use for account/social data. */
export function createMusicReadCache() {
  const pages = new Map<string, { value: unknown; expires: number }>()
  const pending = new Map<string, Promise<unknown>>()
  return function read<T>(key: string, load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    const cached = pages.get(key)
    let result: Promise<T>
    if (cached && cached.expires > Date.now()) {
      pages.delete(key); pages.set(key, cached)
      result = Promise.resolve(cached.value as T)
    } else {
      pages.delete(key)
      result = pending.get(key) as Promise<T>
      if (!result) {
        result = load().then(value => {
          // A provider outage must remain immediately retryable.
          if (!(value && typeof value === 'object' && 'status' in value && value.status === 'offline')) {
            if (pages.size >= 48) pages.delete(pages.keys().next().value!)
            pages.set(key, { value, expires: Date.now() + 120_000 })
          }
          return value
        }).finally(() => pending.delete(key))
        pending.set(key, result)
      }
    }
    if (!signal) return result
    // Cancellation belongs to the reader, not to other readers of this page.
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      signal.addEventListener('abort', abort, { once: true })
      result.then(value => { if (!signal.aborted) resolve(value) }, reject)
        .finally(() => signal.removeEventListener('abort', abort))
    })
  }
}
