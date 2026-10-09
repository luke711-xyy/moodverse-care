import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { MusicTrackSummary } from '../music-domain'
import { FilteredPhoto } from './MomentPhoto'
import { DitherButton, DitherTitle } from './dither/components'
import { clientPoint, isQuarterTurn } from './viewport'
import './cd-picker.css'

type Props = {
  tracks: MusicTrackSummary[]
  selectedIds: string[]
  onToggle: (id: string) => void
  query: string
  onQuery: (query: string) => void
  searchId: string
  max?: number
  min?: number
  primaryId?: string
  onPrimary?: (id: string) => void
  disabled?: boolean
  reducedMotion?: boolean
  player?: { playing: boolean; toggle: () => void }
}
type Flight = { key: number; track: MusicTrackSummary; x: number; y: number; size: number; slot: number }

export function filterCdTracks(tracks: MusicTrackSummary[], query: string) {
  const needle = query.trim().toLocaleLowerCase()
  return tracks.filter(track => !needle || [track.title, track.artistName, ...track.genres].join(' ').toLocaleLowerCase().includes(needle))
}

/** A real cover is never replaced with a fabricated album image. The shared
 * ordered-RGB/CRT pipeline also works when external artwork lacks canvas CORS. */
function CdFace({ track }: { track: MusicTrackSummary }) {
  const noCover = <span className="music-cd-no-art"><small>暂无封面</small><strong>{track.title}</strong><small>{track.artistName}</small></span>
  return <span className="music-cd-disc" data-photo-filter="ordered-dither-crt">
    <span className="music-cd-art">{track.coverUrl
      ? <FilteredPhoto key={track.coverUrl} src={track.coverUrl} alt={`《${track.title}》专辑封面`} fallback={noCover} />
      : noCover}</span>
    <span className="music-cd-sheen" /><span className="music-cd-hub" />
  </span>
}

const inkLoops = Array.from({ length: 3 }, (_, layer) => Array.from({ length: 96 }, (_, i) => {
  const angle = i / 96 * Math.PI * 2
  const radius = 106 + layer * 5 + Math.sin(angle * 7 + layer * 2) * 4 + Math.cos(angle * 11) * 2
  return `${i ? 'L' : 'M'}${120 + Math.cos(angle) * radius},${120 + Math.sin(angle) * radius}`
}).join(' ') + 'Z')

/** Controlled selection: animation is only feedback, never a delayed data write. */
export function CdPicker({ tracks, selectedIds, onToggle, query, onQuery, searchId, max = 5, min = 1,
  primaryId, onPrimary, disabled = false, reducedMotion = false, player }: Props) {
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), flyer = useRef<HTMLDivElement>(null)
  const slots = useRef<Array<HTMLDivElement | null>>([])
  const nextFlight = useRef(0), wheel = useRef({ amount: 0, last: 0, stepAt: -Infinity })
  const swipe = useRef<{ x: number; y: number } | null>(null), suppressClick = useRef(false)
  const [activeId, setActiveId] = useState(selectedIds[0] ?? tracks[0]?.id)
  const [flight, setFlight] = useState<Flight | null>(null)
  const helpId = useId(), infoId = useId()
  const visible = useMemo(() => filterCdTracks(tracks, query), [tracks, query])
  const active = Math.max(0, visible.findIndex(track => track.id === activeId))
  const track = visible[active]
  const current = useRef({ visible, active, disabled })
  current.current = { visible, active, disabled }
  useEffect(() => {
    if (!visible.some(item => item.id === activeId)) setActiveId(visible[0]?.id)
  }, [visible, activeId])
  useEffect(() => { wheel.current = { amount: 0, last: 0, stepAt: -Infinity } }, [visible])

  const move = (direction: number) => {
    const state = current.current
    if (state.disabled || !state.visible.length) return
    const next = Math.max(0, Math.min(state.visible.length - 1, state.active + direction))
    setActiveId(state.visible[next].id)
  }
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const state = current.current
      if (event.ctrlKey || state.disabled || state.visible.length < 2) return
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (!Number.isFinite(delta) || delta === 0) return
      event.preventDefault(); event.stopPropagation()
      const now = performance.now(), data = wheel.current
      if (now - data.last > 150 || Math.sign(delta) !== Math.sign(data.amount)) data.amount = 0
      data.last = now
      data.amount += Math.sign(delta) * Math.min(80, Math.abs(delta) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1))
      if (Math.abs(data.amount) < 24 || now - data.stepAt < 280) return
      const next = Math.max(0, Math.min(state.visible.length - 1, state.active + Math.sign(data.amount)))
      data.amount = 0; data.stepAt = now
      setActiveId(state.visible[next].id)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  useLayoutEffect(() => {
    if (!flight) return
    const host = root.current, element = flyer.current, slot = slots.current[flight.slot]
    if (reducedMotion || !host || !element?.animate || !slot || !selectedIds.includes(flight.track.id)) { setFlight(null); return }
    const rect = (slot.querySelector('.music-cd-disc') ?? slot).getBoundingClientRect()
    const end = clientPoint(host, rect.left + rect.width / 2, rect.top + rect.height / 2)
    const finalSize = isQuarterTurn(host) ? rect.height : rect.width
    const middle = { x: flight.x + (end.x - flight.x) * .62, y: Math.min(flight.y, end.y) - 44 }
    const animation = element.animate([
      { transform: `translate(${flight.x}px,${flight.y}px) scale(1) rotate(-12deg)`, opacity: 1 },
      { transform: `translate(${middle.x}px,${middle.y}px) scale(.66) rotate(12deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${end.x}px,${end.y}px) scale(${finalSize / flight.size}) rotate(0deg)`, opacity: 1 },
    ], { duration: 680, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' })
    let alive = true
    void animation.finished.then(() => { if (alive) setFlight(null) }, () => {})
    return () => { alive = false; animation.cancel() }
  }, [flight, reducedMotion, selectedIds])

  const canToggle = (id: string) => !disabled && (selectedIds.includes(id) ? selectedIds.length > min : selectedIds.length < max)
  const toggle = (item: MusicTrackSummary, source?: HTMLElement) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    if (!canToggle(item.id)) return
    if (selectedIds.includes(item.id)) setFlight(null)
    else if (!reducedMotion && root.current && source) {
      const rect = source.getBoundingClientRect()
      const point = clientPoint(root.current, rect.left + rect.width / 2, rect.top + rect.height / 2)
      const size = isQuarterTurn(root.current) ? rect.height : rect.width
      if (size > 0) setFlight({ key: ++nextFlight.current, track: item, x: point.x, y: point.y, size, slot: selectedIds.length })
    }
    onToggle(item.id)
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.nativeEvent.isComposing) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      if (disabled || !visible.length) return
      if (event.key === 'Home' || event.key === 'End') setActiveId(visible[event.key === 'Home' ? 0 : visible.length - 1].id)
      else move(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1)
      stage.current?.focus({ preventScroll: true })
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target === stage.current && track) {
      event.preventDefault(); toggle(track, stage.current.querySelector<HTMLElement>('[data-active=true] .music-cd-disc') ?? undefined)
    }
  }
  const selected = selectedIds.map(id => tracks.find(item => item.id === id))
  return <div ref={root} className="music-cd-picker" data-reduced-motion={reducedMotion}>
    <div className="music-cd-toolbar">
      <div className="music-cd-search">
        <DitherTitle level={3}>星球歌曲</DitherTitle>
        <label className="music-search-label" htmlFor={searchId}>搜索曲名或艺人</label>
        <input id={searchId} className="music-search" type="search" value={query} disabled={disabled}
          onChange={event => onQuery(event.target.value)} placeholder="曲名、艺人、曲风" />
      </div>
      <div className="music-cd-collection">
        <div className="music-cd-collection-head"><span>已选择</span><span aria-live="polite">{selectedIds.length} / {max} 首</span></div>
        <div className="music-cd-rack" role="group" aria-label="已选择的 CD 架" style={{ '--rack-slots': max } as CSSProperties}>
          {Array.from({ length: max }, (_, i) => {
            const item = selected[i]
            return <div ref={element => { slots.current[i] = element }} className="music-cd-slot" key={i}>
              {item ? <>
                <button className="music-cd-rack-record" type="button" aria-label={`取消选择《${item.title}》`} disabled={!canToggle(item.id)}
                  data-arriving={flight?.track.id === item.id} onClick={() => toggle(item)} title={`取出 ${item.title}`}><CdFace track={item} /></button>
                {onPrimary && <label className="music-cd-primary"><input type="radio" name={`${searchId}-primary`} aria-label={`星球主旋律：${item.title} · ${item.artistName}`}
                  checked={primaryId === item.id} disabled={disabled} onChange={() => onPrimary(item.id)} /><span>{primaryId === item.id ? '主旋律' : '设为主旋律'}</span></label>}
              </> : <span className="music-cd-empty-slot" aria-label={`空位 ${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>}
            </div>
          })}
        </div>
        <p className="music-cd-rack-help">点击架上的 CD 取出{min ? ` · 至少保留 ${min} 首` : ''}</p>
      </div>
    </div>
    <div className="music-cd-browser">
      <div className="music-cd-browse-panel">
        <div ref={stage} className="music-cd-stage" role="group" aria-roledescription="carousel" aria-label="CD 曲库" tabIndex={0}
          aria-describedby={helpId} onKeyDown={onKey} onPointerDown={event => {
            suppressClick.current = false
            if (event.pointerType !== 'mouse' && stage.current && !disabled) swipe.current = clientPoint(stage.current, event.clientX, event.clientY)
          }} onPointerUp={event => {
            const start = swipe.current; swipe.current = null
            if (!start || !stage.current) return
            const end = clientPoint(stage.current, event.clientX, event.clientY)
            if (Math.abs(end.x - start.x) > 36 && Math.abs(end.x - start.x) > Math.abs(end.y - start.y)) {
              suppressClick.current = true; move(end.x < start.x ? 1 : -1)
            }
          }} onPointerCancel={() => { swipe.current = null }}>
          {visible.map((item, index) => {
            const offset = index - active, distance = Math.abs(offset), focused = index === active
            if (distance > 3) return null
            return <div className="music-cd-position" key={item.id} data-active={focused}
              style={{ '--cd-offset': offset, '--cd-distance': distance, '--cd-depth': `${distance * -115}px`, '--cd-turn': `${offset === 0 ? -18 : offset > 0 ? -38 : 30}deg`,
                '--cd-scale': Math.max(.5, 1 - distance * .14), '--cd-opacity': Math.max(.2, 1 - distance * .23), zIndex: 5 - distance } as CSSProperties}>
              <button type="button" className="music-cd-record" data-active={focused} aria-label={`${item.title} · ${item.artistName}`}
                aria-pressed={selectedIds.includes(item.id)} tabIndex={focused ? 0 : -1} disabled={disabled}
                onClick={event => {
                  if (suppressClick.current) { suppressClick.current = false; return }
                  // At the limit, other records can still be browsed and read.
                  setActiveId(item.id); toggle(item, event.currentTarget.querySelector<HTMLElement>('.music-cd-disc') ?? undefined)
                }} onPointerMove={event => {
                  if (reducedMotion || event.pointerType === 'touch' || disabled) return
                  const button = event.currentTarget, point = clientPoint(button, event.clientX, event.clientY)
                  const x = Math.max(-1, Math.min(1, point.x / Math.max(1, button.clientWidth) * 2 - 1))
                  const y = Math.max(-1, Math.min(1, point.y / Math.max(1, button.clientHeight) * 2 - 1))
                  button.style.setProperty('--hover-x', `${x * 9}px`); button.style.setProperty('--hover-y', `${y * 9}px`)
                  button.style.setProperty('--hover-ry', `${x * 9}deg`); button.style.setProperty('--hover-rx', `${-y * 9}deg`)
                }} onPointerLeave={event => {
                  for (const name of ['--hover-x', '--hover-y', '--hover-ry', '--hover-rx']) event.currentTarget.style.removeProperty(name)
                }}>
                <span className="music-cd-hover-body" data-departing={flight?.track.id === item.id}>
                  <svg className="music-cd-ink" viewBox="0 0 240 240" aria-hidden="true">{inkLoops.map((d, i) => <path key={i} d={d} />)}</svg>
                  <CdFace track={item} />
                </span>
                {selectedIds.includes(item.id) && <span className="music-cd-selected-stamp">✓ 已收录</span>}
              </button>
            </div>
          })}
          {!track && <p className="music-cd-empty" role="status">{query.trim() ? '没有找到匹配曲目。试试其他曲名、艺人或曲风。' : '曲库暂时没有歌曲。'}</p>}
        </div>
        <div className="music-cd-navigation">
          <DitherButton aria-label="上一张 CD" disabled={disabled || active === 0 || !track} onClick={() => move(-1)}>←</DitherButton>
          <span>{track ? String(active + 1).padStart(2, '0') : '00'} / {String(visible.length).padStart(2, '0')}</span>
          <DitherButton aria-label="下一张 CD" disabled={disabled || active >= visible.length - 1 || !track} onClick={() => move(1)}>→</DitherButton>
        </div>
        <p id={helpId} className="music-cd-help">滚轮 / ← → 切换 · 点击 CD 收录</p>
      </div>
      <div id={infoId} className="music-cd-info" aria-live="polite" aria-atomic="true">
        {track && <div key={track.id} className="music-cd-info-reveal">
          <span className="music-cd-info-index">当前唱片 · {String(active + 1).padStart(2, '0')}</span>
          <h3>{track.title}</h3>
          <p className="music-cd-artist">{track.artistName}</p>
          {track.versionLabel && <p className="music-cd-version">{track.versionLabel}</p>}
          <dl><div><dt>曲风</dt><dd>{track.genres.join(' / ') || '未提供'}</dd></div>
            <div><dt>节拍</dt><dd>{track.visualFeatures?.tempoBpm ? `${track.visualFeatures.tempoBpm} BPM` : '未提供'}</dd></div>
            <div><dt>时长</dt><dd>{track.durationSeconds != null ? `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, '0')}` : '未提供'}</dd></div>
          </dl>
          {track.isDemo || track.id.startsWith('demo:') ? <p className="music-cd-source-note">演示曲目（不可播放）</p>
            : track.audioUrl && player ? <DitherButton data-music-toggle onClick={player.toggle}>{player.playing ? '暂停 Ⅱ' : '播放 ▶'}</DitherButton> : null}
          <DitherButton className="music-cd-select" disabled={!canToggle(track.id)} onClick={() => toggle(track, stage.current?.querySelector<HTMLElement>('[data-active=true] .music-cd-disc') ?? undefined)}>
            {selectedIds.includes(track.id) ? '从 CD 架取出' : selectedIds.length >= max ? 'CD 架已满' : '+ 收入 CD 架'}
          </DitherButton>
        </div>}
      </div>
    </div>
    {flight && <div ref={flyer} key={flight.key} className="music-cd-flight" aria-hidden="true" style={{ width: flight.size, height: flight.size }}><CdFace track={flight.track} /></div>}
  </div>
}
