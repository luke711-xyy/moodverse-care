import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { DitherButton } from './dither/components'
import { ditherThreshold } from './dither/sampler'
import { MOMENT_PHOTO_ACCEPT, momentPhotoError, validateMomentPhoto } from './moment-photo'

/** Opaque ordered-color dither; transparent PNGs sit on the CRT's dark matte. */
export function ditherMomentPhoto(data: Uint8ClampedArray, width: number) {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    const threshold = ditherThreshold('bayer8', (i / 4) % width, Math.floor(i / 4 / width), 0) - .5
    for (let c = 0; c < 3; c++) {
      const value = data[i + c] * alpha + [17,16,13][c] * (1 - alpha)
      data[i + c] = Math.max(0, Math.min(255, Math.round(value / 51 + threshold) * 51))
    }
    data[i + 3] = 255
  }
  return data
}

/** Photos stay inside the shared CRT glass: curvature, scanlines, grain and lens
 * are inherited from the terminal, with this layer adding real image dithering. */
export function MomentPhoto({ src, alt = 'Moment 照片' }: { src: string; alt?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setRendered(false); setFailed(false) }, [src])
  const filter = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget, target = canvas.current
    const ctx = target?.getContext('2d', { willReadFrequently: true })
    if (!target || !ctx || !image.naturalWidth || !image.naturalHeight) return
    const scale = Math.min(1, 768 / image.naturalWidth, 480 / image.naturalHeight)
    target.width = Math.max(1, Math.round(image.naturalWidth * scale))
    target.height = Math.max(1, Math.round(image.naturalHeight * scale))
    ctx.fillStyle = '#11100d'; ctx.fillRect(0,0,target.width,target.height)
    ctx.filter = 'sepia(.18) saturate(.85) contrast(1.04)'
    ctx.drawImage(image,0,0,target.width,target.height)
    try {
      const pixels = ctx.getImageData(0,0,target.width,target.height)
      ditherMomentPhoto(pixels.data,target.width)
      ctx.putImageData(pixels,0,0); setRendered(true)
    } catch { /* Older external photo URLs can lack CORS; keep the CRT-filtered image. */ }
  }
  return <figure className="music-moment-photo" data-photo-filter="ordered-dither-crt">
    {!failed && <img src={src} alt={alt} loading="lazy" hidden={rendered} onLoad={filter} onError={() => setFailed(true)} />}
    <canvas ref={canvas} hidden={!rendered} role="img" aria-label={alt} />
    {failed && <span role="status">照片暂时无法显示。</span>}
  </figure>
}

export function MomentPhotoPicker({ file, error, busy, onChange }: { file: File | null; error: string; busy: boolean; onChange: (file: File | null, error: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); if (input.current) input.current.value = ''; return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <div className="music-moment-photo-picker">
    <label htmlFor="music-moment-photo">照片 · 最多 1 张，PNG / JPG / JPEG，最大 10 MB</label>
    <input ref={input} id="music-moment-photo" type="file" accept={MOMENT_PHOTO_ACCEPT} disabled={busy} onChange={event => {
      const files = event.target.files
      if (!files?.length) return
      const code = files.length > 1 ? 'TOO_MANY_PHOTOS' : validateMomentPhoto(files[0])
      onChange(code ? null : files[0], code ? momentPhotoError(code) : '')
      if (code) event.target.value = ''
    }} />
    {(file || error) && <div className="music-moment-photo-controls">
      {file && <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
      <DitherButton type="button" disabled={busy} onClick={() => onChange(null,'')}>{file ? '移除照片' : '取消选图'}</DitherButton>
    </div>}
    {error && <p className="music-form-error" role="alert">{error}</p>}
    {file && preview && <MomentPhoto key={preview} src={preview} alt="待发布照片预览" />}
  </div>
}
