import { DIRECT_PHOTO_MAX_BYTES, validateDirectPhoto, directPhotoType } from '../src/music/direct-photo'
export class DirectPhotoError extends Error { constructor(code: string, readonly status = 400) { super(code) } }
export async function readDirectPhoto(request: Request) {
  const limit = DIRECT_PHOTO_MAX_BYTES + 64 * 1024
  if (Number(request.headers.get('content-length')) > limit) throw new DirectPhotoError('PHOTO_TOO_LARGE', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new DirectPhotoError('INVALID_PHOTO')
  try {
    const chunks: Uint8Array[] = []; let length = 0
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      length += value.length
      if (length > limit) { await reader.cancel(); throw new DirectPhotoError('PHOTO_TOO_LARGE', 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type')! } }).formData()
    if (Array.from(form.keys()).some(key => !['photo','contentText'].includes(key)) || form.getAll('photo').length !== 1 || form.getAll('contentText').length > 1) throw new DirectPhotoError('INVALID_PHOTO')
    const file = form.get('photo'); const contentText = form.get('contentText') ?? ''
    if (!file || typeof file === 'string' || typeof contentText !== 'string') throw new DirectPhotoError('INVALID_PHOTO')
    const invalid = validateDirectPhoto(file)
    if (invalid) throw new DirectPhotoError(invalid, invalid === 'PHOTO_TOO_LARGE' ? 413 : 400)
    const photoBytes = new Uint8Array(await file.arrayBuffer()); const type = directPhotoType(photoBytes)
    if (!type || type !== file.type) throw new DirectPhotoError('INVALID_PHOTO')
    return { contentText, photo: { bytes: photoBytes, type } }
  } catch (error) { if (error instanceof DirectPhotoError) throw error; throw new DirectPhotoError('INVALID_PHOTO') }
  finally { reader.releaseLock() }
}
