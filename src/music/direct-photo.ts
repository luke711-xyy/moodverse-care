export const DIRECT_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export function validateDirectPhoto(file: Pick<File, 'size' | 'type'>) {
  if (file.size >= DIRECT_PHOTO_MAX_BYTES) return 'PHOTO_TOO_LARGE'
  if (!file.size || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return 'INVALID_PHOTO'
  return null
}
export function directPhotoType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) && ascii(12,16) === 'IHDR') return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 13 && ['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif'
  return null
}
