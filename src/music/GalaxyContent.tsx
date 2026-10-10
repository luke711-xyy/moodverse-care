import { useEffect, useState } from 'react'
import type { GalaxyGroup, GalaxyGroupBy, MusicApi, MusicGalaxyContent } from '../music-api'
import type { MusicTrackSummary } from '../music-domain'
import { CdFace } from './CdPicker'
import { DitherButton, DitherLoadingRing, DitherTitle } from './dither/components'
import { genreDescription } from './genre-descriptions'
import type { MusicPlayerControls } from './useMusicPlayer'
import { scheduleMusicPrefetch } from './prefetch'

function TrackAction({ track, player }: { track: MusicTrackSummary; player: MusicPlayerControls }) {
  return track.audioUrl
    ? <DitherButton data-music-toggle onClick={() => player.toggle(track)} aria-label={`${player.playing && player.currentTrackId === track.id ? '暂停' : '播放'} ${track.title}`}>
      {player.playing && player.currentTrackId === track.id ? '暂停 Ⅱ' : '播放 ▶'}
    </DitherButton>
    : <small>暂无可用音源</small>
}

function SongDetails({ track, data }: { track: MusicTrackSummary; data: MusicGalaxyContent }) {
  const details = data.songDetails
  const bpm = details?.bpm ?? track.visualFeatures?.tempoBpm
  const duration = track.durationSeconds == null ? '未提供' : `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, '0')}`
  const fields = [
    ['艺人', track.artistName], ['时长', duration], ['曲风', track.genres.join(' / ') || '未提供'],
    ['情绪', track.moodTags.join(' / ') || '未提供'], ['速度', bpm == null ? '未提供' : `${bpm} BPM`],
    ['调性', details?.musicalKey || '未提供'], ['发行日期', details?.releasedAt?.slice(0, 10) || '未提供'],
    ...(track.versionLabel ? [['版本', track.versionLabel]] : []),
    ...(details?.playCount == null ? [] : [['播放', details.playCount.toLocaleString()]]),
    ...(details?.favoriteCount == null ? [] : [['收藏', details.favoriteCount.toLocaleString()]]),
    ...(details?.repostCount == null ? [] : [['转发', details.repostCount.toLocaleString()]]),
  ]
  return <div className="music-galaxy-song-details">
    <p className="music-galaxy-description">{details?.description || '音乐平台暂未提供这首歌的文字介绍。'}</p>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {Boolean(details?.tags?.length) && <p className="music-galaxy-tags">{details!.tags!.map(tag => <span key={tag}>#{tag}</span>)}</p>}
  </div>
}

export function GalaxyContent({ api, by, group, player }: {
  api: Pick<MusicApi, 'loadGalaxyContent'>; by: GalaxyGroupBy; group: GalaxyGroup; player: MusicPlayerControls
}) {
  const identity = `${by}:${group.key}`
  const [navigation, setNavigation] = useState({ identity, offsets: [0] })
  const offsets = navigation.identity === identity ? navigation.offsets : [0]
  const offset = offsets.at(-1)!, page = offsets.length - 1
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ identity: string; offset: number; data: MusicGalaxyContent } | null>(null)
  const [error, setError] = useState('')
  const data = result?.identity === identity && result.offset === offset ? result.data : null
  useEffect(() => {
    const controller = new AbortController()
    setError(''); setResult(null)
    void api.loadGalaxyContent(by, group.key, offset, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ identity, offset, data: value })
    }).catch(() => { if (!controller.signal.aborted) setError('星系内容暂时无法读取，请重试。') })
    return () => controller.abort()
  }, [api, by, group.key, identity, offset, retry])
  useEffect(() => {
    if (!data?.hasMore || data.nextOffset === null) return
    return scheduleMusicPrefetch([() => api.loadGalaxyContent(by, group.key, data.nextOffset!)])
  }, [api, by, group.key, data])

  return <section className="music-galaxy-content" aria-label={by === 'song' ? '星系唱片' : by === 'artist' ? '艺人及歌曲' : '曲风及歌曲'}>
    <div className="music-section-heading"><DitherTitle level={3}>{data?.label && data.label !== group.key ? data.label : group.label}</DitherTitle><small>{by === 'song' ? '歌曲' : by === 'artist' ? '艺人' : '曲风'}</small></div>
    {error ? <div role="alert"><p>{error}</p><DitherButton onClick={() => setRetry(n => n + 1)}>重试星系内容</DitherButton></div>
      : !data ? <DitherLoadingRing label="正在读取星系音乐…" /> : <>
        {by !== 'song' && <p className="music-galaxy-description">{by === 'genre' ? genreDescription(group.key) : data.description?.trim() || '该艺人暂未提供介绍。'}</p>}
        {data.status === 'offline' && <p role="status" className="music-panel-note">部分在线资料暂不可用，先显示已有内容。<DitherButton onClick={() => setRetry(n => n + 1)}>重试</DitherButton></p>}
        {by === 'song' && data.tracks.map(track => <div key={track.id}><div className="music-galaxy-song">
          <CdFace track={track} />
          <div><strong>{track.title}</strong><p>{track.artistName}</p><TrackAction track={track} player={player} /></div>
        </div><SongDetails track={track} data={data} /></div>)}
        <DitherTitle level={3}>{by === 'song' ? '同艺人的其他歌曲' : '推荐歌曲'}</DitherTitle>
        {!(by === 'song' ? data.relatedTracks : data.tracks)?.length && <p className="music-moments-empty">{by === 'song' ? '暂未找到同艺人的其他歌曲。' : '暂未找到推荐歌曲。'}</p>}
        <div className="music-galaxy-track-list">
          {(by === 'song' ? data.relatedTracks ?? [] : data.tracks).map(track => <article className="music-galaxy-track" key={track.id}>
            <CdFace track={track} /><div><strong>{track.title}</strong><small>{track.artistName}</small></div><TrackAction track={track} player={player} />
          </article>)}
        </div>
        {(page > 0 || data.hasMore) && <nav className="music-pagination" aria-label="星系歌曲 分页">
          <DitherButton aria-label="星系歌曲 上一页" disabled={page === 0} onClick={() => setNavigation({ identity, offsets: offsets.slice(0, -1) })}>← 上一页</DitherButton>
          <span aria-live="polite">第 {page + 1} 页</span>
          <DitherButton aria-label="星系歌曲 下一页" disabled={!data.hasMore || data.nextOffset === null} onClick={() => {
            if (data.nextOffset !== null) setNavigation({ identity, offsets: [...offsets, data.nextOffset] })
          }}>下一页 →</DitherButton>
        </nav>}
      </>}
  </section>
}
