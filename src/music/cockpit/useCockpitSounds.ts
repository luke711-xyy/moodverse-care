import { useCallback, useEffect, useRef, type MouseEvent } from 'react'

const files = {
  console: '/audio/dragon-studio-button-press-2-386176.mp3',
  dial: '/audio/freesound_community-clicking-dial-on-toy-76265.mp3',
  radio: '/audio/freesound_community-old-radio-button-click-97549.mp3',
  flight: '/audio/daviddumaisaudio-sci-fi-mechanical-reload-18-316413.mp3',
}
type Sound = keyof typeof files
const levels: Record<Sound, number> = { console: 3.6, radio: 2.4, dial: 1.2, flight: 1.2 }

/** Separate, short Web Audio effects mix with the song without seeking,
 * pausing or replacing the music player's media element/audio clock. */
export function useCockpitSounds(flightToken: number | null = null) {
  const play = useRef<(sound: Sound) => void>(() => {})
  const unlock = useRef<() => void>(() => {})
  useEffect(() => {
    if (typeof AudioContext === 'undefined') return
    let context: AudioContext
    try { context = new AudioContext() } catch { return }
    const abort = new AbortController()
    const gains = new Map<Sound, GainNode>()
    const buffers = new Map<Sound, Promise<AudioBuffer | null>>()
    for (const sound of Object.keys(files) as Sound[]) {
      const gain = context.createGain()
      gain.gain.value = levels[sound]
      gain.connect(context.destination)
      gains.set(sound, gain)
      buffers.set(sound, fetch(files[sound], { signal: abort.signal })
        .then(response => {
          if (!response.ok) throw Error('Sound unavailable')
          return response.arrayBuffer()
        }).then(bytes => context.decodeAudioData(bytes)).catch(() => null))
    }
    const current: Partial<Record<'control' | 'flight', AudioBufferSourceNode>> = {}
    const generation = { control: 0, flight: 0 }
    let disposed = false
    unlock.current = () => { if (context.state !== 'running') void context.resume().catch(() => {}) }
    play.current = sound => {
      if (disposed) return
      // Flight audio finishes independently of subsequent hardware clicks.
      const lane = sound === 'flight' ? 'flight' : 'control'
      const ticket = ++generation[lane]
      current[lane]?.stop()
      delete current[lane]
      // Resume synchronously inside the click gesture, before awaiting decoding.
      // Only the most recent pending click may sound after a slow first load.
      const ready = context.state === 'running' ? Promise.resolve() : context.resume()
      void Promise.all([ready, buffers.get(sound)]).then(([, buffer]) => {
        if (!buffer || disposed || ticket !== generation[lane]) return
        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = false
        source.connect(gains.get(sound)!)
        source.onended = () => { source.disconnect(); if (current[lane] === source) delete current[lane] }
        current[lane] = source
        // The supplied dial recording is 34.4s; use its first single turn,
        // skipping the 125ms lead-in silence and stopping before the next turn.
        source.start(0, sound === 'dial' ? .125 : 0, sound === 'dial' ? .9 : buffer.duration)
      }).catch(() => { /* Audio failure must never block the physical control. */ })
    }
    return () => {
      disposed = true; play.current = () => {}; unlock.current = () => {}
      abort.abort(); Object.values(current).forEach(source => source.stop())
      gains.forEach(gain => gain.disconnect())
      void context.close().catch(() => {})
    }
  }, [])

  // A token identifies one actual crossing, including visits and returns.
  // Progress/ready updates and arrival must not restart or truncate the clip.
  useEffect(() => { if (flightToken !== null) play.current('flight') }, [flightToken])

  return useCallback((event: MouseEvent<HTMLDivElement>) => {
    // Flights can also start from screen controls; unlock in their user gesture.
    unlock.current()
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!button || button.disabled || button.closest('[hidden],[inert]')) return
    if (button.matches('.cockpit-radio-transport button')) play.current('radio')
    else if (button.matches('.cockpit-galaxy-sector')) {
      if (button.getAttribute('aria-pressed') !== 'true') play.current('dial')
    } else if (button.matches('.cockpit-keys button,.cockpit-terminal-header button,.cockpit-terminal-footer button')) {
      play.current('console')
    }
  }, [])
}
