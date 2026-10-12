import { useCallback, useEffect, useRef, useState } from 'react'
import { COSMOS_BEAT, DEFAULT_AUDIO_URL, DEFAULT_TRACK_ID } from './default-track'
import type { MusicTrackSummary } from '../music-domain'
import { setMusicClockSource } from './audio-clock'
import { canPreloadMusic } from './audio-preload'

type PlayableTrack = Pick<MusicTrackSummary, 'id' | 'title' | 'artistName' | 'audioUrl' | 'visualFeatures'> & { coverUrl?: string | null }
type VisitMusic = { planetId: string; tracks: Array<MusicTrackSummary & { isPrimary?: boolean }> }
const playable = (track: PlayableTrack) => track.audioUrl === DEFAULT_AUDIO_URL || track.audioUrl === `/api/music/tracks/${encodeURIComponent(track.id)}/stream`

/** One audible player, with at most three retained media buffers. Switching to
 * an already-warmed element avoids resolving and downloading its source again. */
export function useMusicPlayer({ backgroundTrack = null, ready = true, playlist = [], visit = null, preloadTrack = null }: { backgroundTrack?: MusicTrackSummary | null; ready?: boolean; playlist?: MusicTrackSummary[]; visit?: VisitMusic | null; preloadTrack?: MusicTrackSummary | null } = {}) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const pool = useRef(new Map<string, HTMLAudioElement>())
  const createPlayer = useRef<(() => HTMLAudioElement) | null>(null)
  const releasePlayer = useRef<(player: HTMLAudioElement) => void>(() => {})
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<Pick<MusicTrackSummary, 'id' | 'title' | 'artistName' | 'coverUrl'>>({ id: DEFAULT_TRACK_ID, title: 'Cosmos', artistName: 'The_mountain', coverUrl: null })
  const currentId = useRef('')
  const selectedTrack = useRef<PlayableTrack | null>(null)
  const beforeVisit = useRef<{ track: PlayableTrack; time: number; autoplay: boolean } | null>(null)
  const pendingSeek = useRef<{ id: string; time: number } | null>(null)
  const readyRef = useRef(ready)
  readyRef.current = ready
  const generation = useRef(0)
  const pausedByUser = useRef(false)
  const needsStart = useRef(true)
  const pendingPlay = useRef<number | null>(null)
  const start = useCallback(() => {
    const player = audio.current
    if (!player || !readyRef.current || !currentId.current || pausedByUser.current) return
    const ticket = ++generation.current
    pendingPlay.current = ticket
    setBlocked(false); setError(''); setLoading(true)
    const isCurrent = () => audio.current === player && ticket === generation.current
    const failed = (cause: unknown) => {
      if (!isCurrent()) return
      pendingPlay.current = null
      setLoading(false); setPlaying(false)
      const name = (cause as { name?: string } | null)?.name
      setBlocked(name === 'NotAllowedError')
      // A pause or source change can cancel play without a broken source.
      needsStart.current = name === 'NotAllowedError' || name === 'AbortError'
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError('歌曲未能播放，请重试。')
    }
    try {
      void player.play()?.then(() => {
        if (!isCurrent()) { if (audio.current !== player) player.pause(); return }
        pendingPlay.current = null; needsStart.current = false
        setPlaying(!player.paused); setBlocked(false); setLoading(false)
      }).catch(failed)
    } catch (cause) { failed(cause) }
  }, [])
  useEffect(() => {
    const cleanups = new Map<HTMLAudioElement, () => void>()
    createPlayer.current = () => {
      const player = new Audio('')
      player.loop = true; player.preload = 'auto'; player.volume = .4
      const active = () => audio.current === player
      const onPlay = () => {
        if (!active()) { player.pause(); return }
        setPlaying(true); setBlocked(false); setError('')
      }
      const onPause = () => { if (active()) setPlaying(false) }
      const onError = () => {
        if (!active() || !currentId.current || !readyRef.current) return
        ++generation.current; pendingPlay.current = null; needsStart.current = false
        setPlaying(false); setBlocked(false); setLoading(false); setError('音源暂时不可用，请重试或打开 Audius。')
      }
      const onWaiting = () => { if (active()) setLoading(true) }
      const onReady = () => { if (active()) { needsStart.current = false; setPlaying(true); setLoading(false) } }
      const onCanPlay = () => {
        if (active() && needsStart.current && pendingPlay.current === null && player.paused) start()
      }
      const onMetadata = () => {
        const seek = pendingSeek.current
        if (!active() || !seek || seek.id !== currentId.current) return
        try { player.currentTime = seek.time; pendingSeek.current = null } catch { /* Retry when media becomes seekable. */ }
      }
      player.addEventListener('play', onPlay); player.addEventListener('pause', onPause)
      player.addEventListener('error', onError); player.addEventListener('waiting', onWaiting); player.addEventListener('playing', onReady)
      player.addEventListener('canplay', onCanPlay); player.addEventListener('loadedmetadata', onMetadata)
      cleanups.set(player, () => {
        player.removeEventListener('play', onPlay); player.removeEventListener('pause', onPause)
        player.removeEventListener('error', onError); player.removeEventListener('waiting', onWaiting); player.removeEventListener('playing', onReady)
        player.removeEventListener('canplay', onCanPlay); player.removeEventListener('loadedmetadata', onMetadata)
        player.pause(); player.removeAttribute('src'); player.load()
      })
      return player
    }
    releasePlayer.current = player => {
      cleanups.get(player)?.(); cleanups.delete(player)
      for (const [key, cached] of pool.current) if (cached === player) pool.current.delete(key)
    }
    audio.current = createPlayer.current(); setMusicClockSource(audio.current)
    needsStart.current = false
    // Browsers usually require a first trusted gesture before audible playback.
    const unlock = (event: Event) => {
      if (!event.isTrusted || !needsStart.current) return
      // The player button owns its gesture; auto-unlocking it first would
      // immediately turn its intended Play click into a Pause click.
      if ((event.target as Element | null)?.closest?.('[data-music-toggle]')) return
      if (audio.current?.paused) start()
    }
    document.addEventListener('pointerdown', unlock, { capture: true })
    // Touch/pen activation may become available only when the pointer is released.
    document.addEventListener('pointerup', unlock, { capture: true })
    document.addEventListener('keydown', unlock, { capture: true })
    return () => {
      ++generation.current; pendingPlay.current = null
      document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true)
      document.removeEventListener('pointerup', unlock, true)
      audio.current = null; currentId.current = ''; setMusicClockSource(null)
      for (const player of cleanups.keys()) releasePlayer.current(player)
      pool.current.clear(); createPlayer.current = null
    }
  }, [start])
  const getPlayer = useCallback((track: PlayableTrack) => {
    const key = track.audioUrl!
    let player = pool.current.get(key)
    if (player?.error && player !== audio.current) { releasePlayer.current(player); player = undefined }
    if (!player) {
      player = !currentId.current && audio.current ? audio.current : createPlayer.current?.()
      if (!player) return null
      player.src = key
    }
    pool.current.delete(key); pool.current.set(key, player)
    return player
  }, [])
  const trimPool = useCallback(() => {
    for (const [key, player] of pool.current) {
      if (pool.current.size <= 3) break
      if (player !== audio.current && key !== beforeVisit.current?.track.audioUrl) releasePlayer.current(player)
    }
  }, [])
  const selectTrack = useCallback((track: PlayableTrack, autoplay = true, resumeTime?: number) => {
    const previous = audio.current
    if (!previous || !readyRef.current) return
    // Only server-issued same-origin stream paths can be played.
    if (!playable(track)) return
    const player = getPlayer(track)
    if (!player) return
    pendingSeek.current = null
    selectedTrack.current = track
    if (currentId.current !== track.id) {
      ++generation.current; pendingPlay.current = null
      previous.pause(); audio.current = player; currentId.current = track.id
      if (resumeTime === undefined) { try { player.currentTime = 0 } catch { /* A new stream already starts at zero. */ } }
      setCurrentTrack({ id: track.id, title: track.title, artistName: track.artistName, coverUrl: track.coverUrl ?? null })
      setMusicClockSource(player, track.id === DEFAULT_TRACK_ID ? COSMOS_BEAT : { bpm: track.visualFeatures?.tempoBpm ?? null, offsetSeconds: 0 })
    }
    trimPool()
    if (resumeTime !== undefined) {
      pendingSeek.current = { id: track.id, time: resumeTime }
      try { player.currentTime = resumeTime; if (player.readyState >= 1) pendingSeek.current = null } catch { /* Seek after metadata loads. */ }
    }
    pausedByUser.current = !autoplay; needsStart.current = autoplay
    setError(''); setBlocked(false); setLoading(false)
    if (autoplay) start()
    else {
      ++generation.current; pendingPlay.current = null
      player.pause(); setPlaying(false)
    }
  }, [start, getPlayer, trimPool])
  // Only a confirmed saved primary (or account readiness) changes the background.
  // A fresh response object must not interrupt auditioning or a deliberate pause.
  const backgroundRef = useRef(backgroundTrack)
  backgroundRef.current = backgroundTrack
  const backgroundId = backgroundTrack?.id ?? DEFAULT_TRACK_ID
  const visitRef = useRef(visit)
  visitRef.current = visit
  const visitId = visit?.planetId
  const visitPrimaryId = visit?.tracks.find(track => track.isPrimary)?.id
  useEffect(() => {
    const player = audio.current
    if (!player) return
    if (!ready) {
      beforeVisit.current = null; selectedTrack.current = null; pendingSeek.current = null
      ++generation.current; pendingPlay.current = null; needsStart.current = false
      player.pause(); player.removeAttribute('src'); player.load(); currentId.current = ''
      for (const cached of pool.current.values()) if (cached !== player) releasePlayer.current(cached)
      pool.current.clear()
      setPlaying(false); setBlocked(false); setLoading(false); setError(''); setMusicClockSource(null)
      return
    }
    const visiting = visitRef.current
    if (visiting) {
      if (!beforeVisit.current && selectedTrack.current) {
        beforeVisit.current = { track: selectedTrack.current, time: pendingSeek.current?.time ?? player.currentTime,
          autoplay: !pausedByUser.current && (!player.paused || pendingPlay.current !== null || needsStart.current) }
      }
      const primary = visiting.tracks.find(track => track.isPrimary && track.audioUrl)
      if (primary) selectTrack(primary)
      else {
        ++generation.current; pendingPlay.current = null; needsStart.current = false
        player.pause(); setPlaying(false); setLoading(false)
      }
      return
    }
    const saved = beforeVisit.current
    if (saved) {
      beforeVisit.current = null
      selectTrack(saved.track, saved.autoplay, saved.time)
      return
    }
    selectTrack(backgroundRef.current ?? { id: DEFAULT_TRACK_ID, title: 'Cosmos', artistName: 'The_mountain', audioUrl: DEFAULT_AUDIO_URL })
  }, [ready, backgroundId, visitId, visitPrimaryId, selectTrack])
  const preloadRef = useRef(preloadTrack); preloadRef.current = preloadTrack
  useEffect(() => {
    let warming: HTMLAudioElement | null = null
    const release = () => {
      // React runs effect cleanups before the destination-selection effect.
      // Preserve the buffer that this very render is about to activate.
      const arriving = visitRef.current?.tracks.find(track => track.isPrimary && track.audioUrl)?.audioUrl
      if (warming && warming !== audio.current && pool.current.get(beforeVisit.current?.track.audioUrl ?? '') !== warming
        && pool.current.get(arriving ?? '') !== warming) releasePlayer.current(warming)
      warming = null
    }
    const warm = () => {
      const track = preloadRef.current
      if (!ready || !track || !playable(track) || !canPreloadMusic()) { release(); return }
      warming = getPlayer(track); trimPool()
    }
    warm()
    document.addEventListener('visibilitychange', warm)
    window.addEventListener('online', warm); window.addEventListener('offline', warm)
    return () => {
      document.removeEventListener('visibilitychange', warm)
      window.removeEventListener('online', warm); window.removeEventListener('offline', warm)
      release()
    }
  }, [ready, preloadTrack?.id, preloadTrack?.audioUrl, getPlayer, trimPool])
  const toggle = useCallback((track?: MusicTrackSummary) => {
    const player = audio.current
    if (!player || !readyRef.current) return
    if (track && track.id !== currentId.current) {
      selectTrack(track)
      return
    }
    if (!player.paused || pendingPlay.current !== null) {
      ++generation.current; pendingPlay.current = null
      pausedByUser.current = true; needsStart.current = false
      player.pause(); setPlaying(false); setLoading(false); setBlocked(false)
    }
    else { pausedByUser.current = false; needsStart.current = true; start() }
  }, [start, selectTrack])
  const queue = (visit?.tracks ?? playlist).slice(0, 5).filter(track => track.audioUrl === DEFAULT_AUDIO_URL || track.audioUrl === `/api/music/tracks/${encodeURIComponent(track.id)}/stream`)
  const skip = (direction: -1 | 1) => {
    if (!ready || queue.length < 2) return
    const index = queue.findIndex(track => track.id === currentId.current)
    const nextIndex = index < 0 ? (direction === 1 ? 0 : queue.length - 1) : (index + direction + queue.length) % queue.length
    selectTrack(queue[nextIndex], !pausedByUser.current)
  }
  return { playing, blocked, error, loading, currentTrack, currentTrackId: currentTrack.id, toggle,
    canSkip: ready && queue.length > 1, previous: () => skip(-1), next: () => skip(1) }
}
export type MusicPlayerControls = { playing: boolean; currentTrackId?: string; toggle: (track?: MusicTrackSummary) => void }
