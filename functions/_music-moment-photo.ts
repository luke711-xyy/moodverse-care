import { MOMENT_PHOTO_MAX_BYTES, validateMomentPhoto, momentPhotoContentType } from '../src/music/moment-photo'
import type { MomentInput } from './_music-moments'

export class MomentPhotoError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
}

export async function readPhotoMoment(request: Request): Promise<{ input: MomentInput; photo: { bytes: Uint8Array; type: string } }> {
  const limit = MOMENT_PHOTO_MAX_BYTES + 64 * 1024
  if (Number(request.headers.get('content-length')) > limit) throw new MomentPhotoError('PHOTO_TOO_LARGE', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new MomentPhotoError('INVALID_PHOTO')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) { await reader.cancel(); throw new MomentPhotoError('PHOTO_TOO_LARGE', 413) }
      chunks.push(value)
    }
    const buffer = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
    const form = await new Response(buffer, { headers: { 'content-type': request.headers.get('content-type')! } }).formData()
    const files = Array.from(form.values()).filter((value): value is File => typeof value !== 'string')
    if (files.length > 1 || form.getAll('photo').length > 1) throw new MomentPhotoError('TOO_MANY_PHOTOS')
    const photo = form.get('photo')
    if (!photo || typeof photo === 'string' || files.length !== 1) throw new MomentPhotoError('INVALID_PHOTO')
    const invalid = validateMomentPhoto(photo)
    if (invalid) throw new MomentPhotoError(invalid, invalid === 'PHOTO_TOO_LARGE' ? 413 : 400)
    const bytes = new Uint8Array(await photo.arrayBuffer())
    const type = momentPhotoContentType(bytes)
    const expected = photo.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    if (type !== expected) throw new MomentPhotoError('INVALID_PHOTO')
    for (const key of ['trackId','contentText','visibility']) {
      if (form.getAll(key).length > 1 || typeof form.get(key) !== 'string') throw new MomentPhotoError('INVALID_MOMENT')
    }
    return { input: { trackId: form.get('trackId'), contentText: form.get('contentText'), visibility: form.get('visibility') }, photo: { bytes, type } }
  } catch (error) {
    if (error instanceof MomentPhotoError) throw error
    throw new MomentPhotoError('INVALID_PHOTO')
  } finally { reader.releaseLock() }
}
