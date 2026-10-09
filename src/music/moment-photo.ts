export const MOMENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const MOMENT_PHOTO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg'
export const MOMENT_PHOTO_PATH = '/api/music/moment-photos/'

export function validateMomentPhoto(file: { name: string; type: string; size: number }): string | null {
  if (file.size > MOMENT_PHOTO_MAX_BYTES) return 'PHOTO_TOO_LARGE'
  if (file.size === 0) return 'INVALID_PHOTO'
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!['png', 'jpg', 'jpeg'].includes(extension ?? '')) return 'UNSUPPORTED_PHOTO_TYPE'
  if (file.type && file.type !== (extension === 'png' ? 'image/png' : 'image/jpeg')) return 'UNSUPPORTED_PHOTO_TYPE'
  return null
}

export function momentPhotoError(code: string): string {
  if (code === 'PHOTO_TOO_LARGE') return '照片不能超过 10 MB。'
  if (code === 'TOO_MANY_PHOTOS') return '每条 Moment 最多上传 1 张照片。'
  if (code === 'UNSUPPORTED_PHOTO_TYPE') return '请选择 PNG、JPG 或 JPEG 照片。'
  if (code === 'PHOTO_STORAGE_UNAVAILABLE') return '照片暂时无法上传，已保留所选照片，请稍后重试。'
  return '照片无法读取，请重新选择有效的 PNG、JPG 或 JPEG 照片。'
}

export function isManagedMomentPhoto(url: unknown): url is string {
  return typeof url === 'string' && /^\/api\/music\/moment-photos\/[a-f0-9-]{36}$/.test(url)
}

/** Signature + dimensions reject renamed/non-image payloads before storage. */
export function momentPhotoContentType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((byte,i) => bytes[i] === byte)
    && bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16) > 0
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20) > 0) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return 'image/jpeg'
  return null
}
