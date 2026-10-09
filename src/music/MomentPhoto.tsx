import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MusicTrackSummary } from '../music-domain'
import { DitherButton, DitherTrackMark } from './dither/components'
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
export function FilteredPhoto({ src, alt, enlarged = false, fallback }: { src: string; alt: string; enlarged?: boolean; fallback?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setRendered(false); setFailed(false) }, [src])
  const filter = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget, target = canvas.current
    const ctx = target?.getContext('2d', { willReadFrequently: true })
    if (!target || !ctx || !image.naturalWidth || !image.naturalHeight) return
    const scale = Math.min(1, (enlarged ? 1536 : 768) / image.naturalWidth, (enlarged ? 1024 : 480) / image.naturalHeight)
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
  return <>
    {!failed && <img src={src} alt={alt} loading={enlarged ? 'eager' : 'lazy'} hidden={rendered} onLoad={filter} onError={() => setFailed(true)} />}
    <canvas ref={canvas} hidden={!rendered} role="img" aria-label={alt} />
    {failed && (fallback ?? <span role="status">照片暂时无法显示。</span>)}
  </>
}

export function MomentPhoto({ src, alt = 'Moment 照片' }: { src: string; alt?: string }) {
  const trigger = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null)
  const [viewerHost, setViewerHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setViewerHost(null) }, [src])
  useEffect(() => {
    if (!viewerHost) return
    // The viewer is a sibling of the scrolling content, inside the same CRT.
    // Keep its filters and mobile rotation, but disable the covered controls.
    const controls = Array.from(trigger.current?.closest('.cockpit-terminal')?.querySelectorAll<HTMLElement>(
      '.cockpit-terminal-header, .cockpit-terminal-content, .cockpit-terminal-footer',
    ) ?? [])
    const attributes = controls.map(element => [element, element.getAttribute('inert'), element.getAttribute('aria-hidden')] as const)
    controls.forEach(element => { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true') })
    close.current?.focus({ preventScroll: true })
    return () => {
      attributes.forEach(([element, inert, hidden]) => {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert)
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden)
      })
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true })
    }
  }, [viewerHost])
  return <figure className="music-moment-photo" data-photo-filter="ordered-dither-crt">
    <button ref={trigger} className="music-moment-photo-button" type="button" aria-label={`放大查看${alt}`} aria-haspopup="dialog"
      onClick={() => setViewerHost(trigger.current?.closest<HTMLElement>('.crt-image') ?? document.body)}>
      <FilteredPhoto src={src} alt={alt} />
    </button>
    {viewerHost && createPortal(<div className="music-moment-photo-viewer" data-standalone={viewerHost === document.body} role="dialog" aria-modal="true" aria-label="照片大图"
      onClick={event => { if (event.target === event.currentTarget) setViewerHost(null) }}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); setViewerHost(null) }
        if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
      }}>
      <button ref={close} className="music-moment-photo-close" type="button" aria-label="返回 Moment" onClick={() => setViewerHost(null)}>← 返回 Moment</button>
      <figure className="music-moment-photo-full" data-photo-filter="ordered-dither-crt"><FilteredPhoto key={src} src={src} alt={alt} enlarged /></figure>
    </div>, viewerHost)}
  </figure>
}

export function MomentContent({ contentText, photoUrl, track }: { contentText: string | null; photoUrl?: string | null; track?: MusicTrackSummary }) {
  const record = track && <span role="img" aria-label={`《${track.title}》唱片图案`}><DitherTrackMark track={track} /></span>
  return <div className="music-moment-body">
    {track && <div className="music-moment-song">
      <figure className="music-moment-cover" data-photo-filter="ordered-dither-crt">
        {track.coverUrl ? <FilteredPhoto key={track.coverUrl} src={track.coverUrl} alt={`《${track.title}》封面`} fallback={record} /> : record}
      </figure>
      <div className="music-moment-song-label"><strong>{track.title}</strong><small>{track.artistName}</small></div>
    </div>}
    <div className="music-moment-copy">{contentText && <p>{contentText}</p>}</div>
    {photoUrl && <MomentPhoto src={photoUrl} />}
  </div>
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
