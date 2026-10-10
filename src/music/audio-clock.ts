import { COSMOS_BEAT } from './default-track'

export const MUSIC_TIDE_BEATS_PER_CYCLE = 2
export type MusicBeatClock = { cycles: number; bpm: number; playing: boolean }
let source: HTMLAudioElement | null = null
let beat: { bpm: number | null; offsetSeconds: number } = COSMOS_BEAT
export function setMusicClockSource(audio: HTMLAudioElement | null, timing = COSMOS_BEAT as { bpm: number | null; offsetSeconds: number }) { source = audio; beat = timing }
export function getMusicBeatClock(): MusicBeatClock | undefined {
  if (!source || !beat.bpm) return undefined
  // Divide before wrapping the phase so a tide spans two complete song beats.
  const bpm = beat.bpm / MUSIC_TIDE_BEATS_PER_CYCLE
  const cycles = (source.currentTime - beat.offsetSeconds) * bpm / 60
  return { cycles: ((cycles % 1) + 1) % 1, bpm, playing: !source.paused && !source.ended }
}
