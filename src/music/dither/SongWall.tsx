import { useEffect, useMemo, useState } from 'react'
import type { MusicTrackSummary } from '../../music-domain'
import { createDitherSpec } from './appearance'
import { DitherThumbnail } from './DitherCanvas'
export function SongWall({ tracks, selectedId, onSelect, player }: { tracks: MusicTrackSummary[]; selectedId?: string; onSelect: (id: string)=>void; player?: { playing: boolean; toggle: () => void } }) {
  const [local, setLocal] = useState(selectedId ?? tracks[0]?.id)
  useEffect(()=>{ if(selectedId && tracks.some(t=>t.id===selectedId)) setLocal(selectedId) },[selectedId,tracks])
  const selected = tracks.find(t=>t.id===local) ?? tracks[0]
  const specs = useMemo(()=>tracks.map(track=>createDitherSpec({ planetId:'record:'+track.id,tracks:[track] })),[tracks])
  if (!selected) return null
  const active=tracks.indexOf(selected)
  return <section className="dither-song-wall" aria-label="唱片墙">
    <div className="dither-record-fan" role="group" aria-label="选择唱片">{tracks.map((track,index)=><button type="button" key={track.id} aria-label={`查看唱片《${track.title}》`} aria-pressed={track.id===selected.id} style={{ '--record-angle': `${(index-(tracks.length-1)/2)*6}deg`, '--record-offset': `${(index-(tracks.length-1)/2)*24}px` } as React.CSSProperties} onClick={()=>{setLocal(track.id);onSelect(track.id)}}>
      <DitherThumbnail spec={specs[index]} size={128} kind="music" />
      <span>{track.title}</span>
    </button>)}</div>
    <div className="dither-focused-record"><DitherThumbnail spec={specs[active]} size={192} kind="music" /><div><strong>{selected.title}</strong><small>{selected.artistName}</small>{selected.audioUrl && player ? <button data-music-toggle onClick={player.toggle} aria-label={player.playing ? '暂停 Cosmos' : '播放 Cosmos'}>{player.playing ? '暂停 Ⅱ' : '播放 ▶'}</button> : selected.officialUrl ? <a href={selected.officialUrl} target="_blank" rel="noreferrer" aria-label={`播放《${selected.title}》：在官方平台打开`}>官方播放 ↗</a> : <small>演示曲目 · 不可播放</small>}</div></div>
  </section>
}
