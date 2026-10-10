import { useEffect, useState, type CSSProperties } from 'react'
import type { MusicTrackSummary } from '../../music-domain'
import type { MusicPlayerControls } from '../useMusicPlayer'
import { CdFace } from '../CdPicker'
import './song-wall.css'

const PAGE_SIZE = 6
// Stable, deliberately uneven placements: reshuffling on render would move click targets.
const placements = [[-22,-12,-26],[18,22,20],[-5,-37,-8],[27,-25,30],[-20,40,-16],[4,28,12]]

export function SongWall({ tracks, selectedId, onSelect, player }: { tracks: MusicTrackSummary[]; selectedId?: string; onSelect: (id: string) => void; player?: MusicPlayerControls }) {
  const [local, setLocal] = useState(selectedId ?? tracks[0]?.id)
  const selectedIndex = tracks.findIndex(track => track.id === selectedId)
  const [page, setPage] = useState(() => Math.max(0, Math.floor(selectedIndex / PAGE_SIZE)))
  useEffect(() => {
    if (selectedId !== undefined && selectedIndex >= 0) { setLocal(selectedId); setPage(Math.floor(selectedIndex / PAGE_SIZE)) }
  }, [selectedId, selectedIndex])
  const selected = tracks.find(track => track.id === local) ?? tracks[0]
  const pageCount = Math.ceil(tracks.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const pageTracks = tracks.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  if (!selected) return null
  const playing = player?.playing && player.currentTrackId === selected.id
  return <section className="dither-song-wall" aria-label="唱片墙">
    <div className="music-cd-pile" role="group" aria-label="选择唱片">{pageTracks.map((track, index) => <button type="button" key={track.id}
      aria-label={`查看唱片《${track.title}》`} aria-pressed={track.id === selected.id}
      title={`${track.title} · ${track.artistName}`} className="music-cd-pile-record"
      style={{ '--pile-x': `${pageTracks.length === 1 ? 0 : placements[index][0]}%`, '--pile-y': `${placements[index][1]}px`, '--pile-angle': `${placements[index][2]}deg`, '--pile-layer': index + 1 } as CSSProperties}
      onClick={() => { setLocal(track.id); onSelect(track.id) }}>
      <CdFace track={track} />
    </button>)}</div>
    {pageCount > 1 && <nav className="music-song-pages" aria-label="唱片分页">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
      <span role="status">{currentPage + 1} / {pageCount} 页 · 共 {tracks.length} 首</span>
      <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
    </nav>}
    <div className="dither-focused-record music-focused-cd">
      <span className="music-focused-cd-art"><CdFace track={selected} /></span>
      <div><strong>{selected.title}</strong><small>{selected.artistName}</small>
        {selected.audioUrl && player ? <button type="button" data-music-toggle onClick={() => player.toggle(selected)} aria-label={`${playing ? '暂停' : '播放'} ${selected.title}`}>{playing ? '暂停 Ⅱ' : '播放 ▶'}</button>
          : <small>历史曲目 · 不可播放</small>}
      </div>
    </div>
  </section>
}
