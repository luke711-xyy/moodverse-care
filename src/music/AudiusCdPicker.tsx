import { useEffect, useMemo, useRef, useState } from 'react'
import type { MusicApi, MusicCatalogPage } from '../music-api'
import type { MusicTrackSummary } from '../music-domain'
import { CdPicker, type CdPickerProps } from './CdPicker'

type CatalogPosition = { key: string; offsets: number[]; index: number }
type CatalogView = CatalogPosition & { page: MusicCatalogPage }

/** Each cursor replaces the visible page; selected discs belong to the parent. */
export function AudiusCdPicker({ api, onTracks, ...props }: CdPickerProps & { api: MusicApi; onTracks: (tracks: MusicTrackSummary[]) => void }) {
  const [genre, setGenre] = useState(''), [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready')
  const key = JSON.stringify([props.query, genre])
  const [position, setPosition] = useState<CatalogPosition>({ key, offsets: [0], index: 0 })
  const [view, setView] = useState<CatalogView>(() => ({ key, offsets: [0], index: 0, page: { tracks: props.tracks.slice(0, 24) } }))
  const [retry, setRetry] = useState(0)
  const requestPosition = position.key === key ? position : { key, offsets: [0], index: 0 }
  const offset = requestPosition.offsets[requestPosition.index]
  const ticket = useRef(0), latest = useRef(onTracks)
  latest.current = onTracks
  useEffect(() => { setPosition({ key, offsets: [0], index: 0 }) }, [key])
  useEffect(() => {
    const id = ++ticket.current, controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(() => {
      void api.searchCatalog(props.query, genre, offset, controller.signal).then(result => {
        if (id !== ticket.current || controller.signal.aborted) return
        // An unavailable provider must not erase a valid page or the selected rack.
        if (result.status !== 'offline' || result.tracks.length) {
          latest.current(result.tracks)
          setView({ ...requestPosition, page: result })
        }
        setStatus(result.status === 'offline' ? 'error' : 'ready')
      }).catch(() => { if (!controller.signal.aborted && id === ticket.current) setStatus('error') })
    }, props.query.trim() && requestPosition.index === 0 ? 350 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [api, props.query, genre, offset, requestPosition.index, retry])
  // Keep this entire page available even if the parent's catalog cache is smaller.
  const tracks = useMemo(() => [...new Map([...props.tracks, ...view.page.tracks].map(track => [track.id, track])).values()], [props.tracks, view.page.tracks])
  const browseIds = useMemo(() => view.page.tracks.map(track => track.id), [view.page.tracks])
  const nextOffset = view.page.nextOffset
  const canNext = view.page.hasMore && typeof nextOffset === 'number' && Number.isFinite(nextOffset) && nextOffset > view.offsets[view.index]
  const navigationDisabled = props.disabled || status === 'loading' || view.key !== key
  const navigate = (next: CatalogPosition) => {
    setPosition(next)
    // A failed next-page attempt leaves the current page visible. Clicking next
    // again must retry even when its requested offset has not changed.
    setRetry(value => value + 1)
  }
  const toggle = (id: string) => {
    // A local page may exceed the parent's cache limit. Promote a newly chosen
    // record before selection so it remains resolvable on subsequent pages.
    const track = tracks.find(item => item.id === id)
    if (track && !props.selectedIds.includes(id) && !props.tracks.some(item => item.id === id)) {
      latest.current([track, ...view.page.tracks.filter(item => item.id !== id)])
    }
    props.onToggle(id)
  }
  return <><CdPicker {...props} onToggle={toggle} tracks={tracks} browseIds={browseIds} catalogStatus={status} genre={genre} onGenre={setGenre}
    hasMore={false} onMore={undefined}
    catalogMessage={status === 'error' ? '曲库暂时无法加载，请重试。' : undefined} />
    <nav className="music-catalog-controls" aria-label="曲库分页">
      <button className="music-text-button" type="button" aria-label="曲库上一页" disabled={navigationDisabled || view.index === 0}
        onClick={() => navigate({ key, offsets: view.offsets, index: view.index - 1 })}>上一页</button>
      <span role="status">第 {view.index + 1} 页 · 本页 {view.page.tracks.length} 首</span>
      <button className="music-text-button" type="button" aria-label="曲库下一页" disabled={navigationDisabled || !canNext}
        onClick={() => { if (canNext) navigate({ key, offsets: [...view.offsets.slice(0, view.index + 1), nextOffset], index: view.index + 1 }) }}>下一页</button>
    </nav>
    {status === 'error' && <button className="music-text-button" type="button" disabled={props.disabled} onClick={() => setRetry(n => n + 1)}>重试</button>}</>
}
