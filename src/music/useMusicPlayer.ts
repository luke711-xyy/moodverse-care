import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_AUDIO_URL } from './default-track'
import { setMusicClockSource } from './audio-clock'

/** One persistent player across monitor changes and nebula flights. */
export function useMusicPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const pausedByUser = useRef(false)
  useEffect(() => {
    const player = new Audio(DEFAULT_AUDIO_URL)
    player.loop = true; player.preload = 'auto'; player.volume = .5
    audio.current = player; setMusicClockSource(player)
    let disposed = false
    const start = () => {
      if (pausedByUser.current || disposed) return
      const result = player.play()
      result?.then(() => { if (!disposed) setBlocked(false) }).catch(() => { if (!disposed) setBlocked(true) })
    }
    const onPlay = () => { setPlaying(true); setBlocked(false) }
    const onPause = () => setPlaying(false)
    player.addEventListener('play', onPlay); player.addEventListener('pause', onPause)
    // Browsers usually require a first trusted gesture before audible playback.
    const unlock = (event: Event) => {
      // The player button owns its gesture; auto-unlocking it first would
      // immediately turn its intended Play click into a Pause click.
      if ((event.target as Element | null)?.closest?.('[data-music-toggle]')) return
      if (player.paused) start()
    }
    document.addEventListener('pointerdown', unlock, { capture: true })
    document.addEventListener('keydown', unlock, { capture: true })
    start()
    return () => {
      disposed = true
      document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true)
      player.removeEventListener('play', onPlay); player.removeEventListener('pause', onPause)
      player.pause(); player.removeAttribute('src'); player.load()
      audio.current = null; setMusicClockSource(null)
    }
  }, [])
  const toggle = useCallback(() => {
    const player = audio.current
    if (!player) return
    if (!player.paused) { pausedByUser.current = true; player.pause() }
    else { pausedByUser.current = false; void player.play()?.catch(() => setBlocked(true)) }
  }, [])
  return { playing, blocked, toggle }
}
