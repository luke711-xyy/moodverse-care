export type AlbumPixels = { width: number; height: number; data: Uint8ClampedArray }
type Entry = { status: 'loading' | 'ready' | 'error'; pixels?: AlbumPixels }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
export function subscribeAlbumTextures(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Shared bounded cache for GPU, thumbnails and the Canvas2D fallback. */
export function loadAlbumTexture(url?: string): Entry | undefined {
  if (!url || typeof Image === 'undefined') return undefined
  const cached = cache.get(url)
  if (cached) return cached
  const entry: Entry = { status: 'loading' }
  if (cache.size >= 64) cache.delete(cache.keys().next().value!)
  cache.set(url, entry)
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.referrerPolicy = 'no-referrer'
  const finish = () => { for (const listener of listeners) listener() }
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      const size=Math.min(512,image.naturalWidth,image.naturalHeight)
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('NO_IMAGE_CONTEXT')
      const edge = Math.min(image.naturalWidth, image.naturalHeight)
      ctx.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, size, size)
      entry.pixels = ctx.getImageData(0, 0, size, size)
      entry.status = 'ready'
    } catch { entry.status = 'error' }
    finish()
  }
  image.onerror = () => { entry.status = 'error'; finish() }
  image.src = url
  return entry
}
